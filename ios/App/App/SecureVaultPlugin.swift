import Foundation
import Capacitor
import CryptoKit
import LocalAuthentication
import Security

@objc(SecureVaultPlugin)
public class SecureVaultPlugin: CAPPlugin {
    private let service = "stream.wallet.vault.v1"
    private let account = "encryption-key"
    private let payloadKey = "stream.wallet.vault.ciphertext"
    private let addressKey = "stream.wallet.vault.address"

    @objc public func status(_ call: CAPPluginCall) {
        let context = LAContext()
        var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
        let defaults = UserDefaults.standard
        let exists = defaults.string(forKey: payloadKey) != nil
            && defaults.string(forKey: addressKey) != nil
            && keyExists()

        var result: [String: Any] = [
            "available": available,
            "exists": exists,
            "platform": "ios",
            "protection": "biometric-or-device-passcode"
        ]
        if exists, let address = defaults.string(forKey: addressKey) {
            result["address"] = address
        }
        call.resolve(result)
    }

    @objc public func save(_ call: CAPPluginCall) {
        guard let rawMnemonic = call.getString("mnemonic") else {
            call.reject("A validated 12-word recovery phrase is required.", "invalid_mnemonic")
            return
        }
        let mnemonic = rawMnemonic
            .split(whereSeparator: { $0.isWhitespace })
            .map(String.init)
            .joined(separator: " ")
        guard mnemonic.split(separator: " ").count == 12 else {
            call.reject("A validated 12-word recovery phrase is required.", "invalid_mnemonic")
            return
        }
        guard let address = call.getString("address"), address.hasPrefix("zkas:") else {
            call.reject("A validated ZKAS mainnet address is required.", "invalid_address")
            return
        }
        guard let accountSeedHex = call.getString("accountSeedHex"), isHex(accountSeedHex, count: 64),
              let fvkHex = call.getString("fvkHex"), isHex(fvkHex, count: 192),
              let walletToken = call.getString("walletToken"), isHex(walletToken, count: 32) else {
            call.reject("Validated mainnet wallet material is required.", "invalid_wallet_material")
            return
        }
        let birthdayDaa = max(0, call.getInt("birthdayDaa") ?? 0)
        guard UserDefaults.standard.string(forKey: payloadKey) == nil && !keyExists() else {
            call.reject("A wallet already exists on this device.", "vault_exists")
            return
        }

        authenticate(reason: "Protect your Stream Wallet recovery phrase") { [weak self] success, authError in
            guard let self = self else { return }
            guard success else {
                call.reject(authError?.localizedDescription ?? "Device authentication was cancelled.", "authentication_cancelled")
                return
            }
            DispatchQueue.global(qos: .userInitiated).async {
                var keyData = Data(count: 32)
                let randomStatus = keyData.withUnsafeMutableBytes { bytes in
                    SecRandomCopyBytes(kSecRandomDefault, 32, bytes.baseAddress!)
                }
                guard randomStatus == errSecSuccess else {
                    self.rejectOnMain(call, "Secure random key generation failed.", "secure_storage_unavailable")
                    return
                }

                do {
                    try self.storeKey(keyData)
                    let key = SymmetricKey(data: keyData)
                    var plaintext = try JSONSerialization.data(withJSONObject: [
                        "version": 2,
                        "mnemonic": mnemonic,
                        "address": address,
                        "accountSeedHex": accountSeedHex.lowercased(),
                        "fvkHex": fvkHex.lowercased(),
                        "walletToken": walletToken.lowercased(),
                        "birthdayDaa": birthdayDaa
                    ])
                    defer { plaintext.resetBytes(in: 0..<plaintext.count) }
                    let sealed = try AES.GCM.seal(plaintext, using: key)
                    guard let combined = sealed.combined else {
                        throw VaultError.invalidCiphertext
                    }
                    UserDefaults.standard.set(combined.base64EncodedString(), forKey: self.payloadKey)
                    UserDefaults.standard.set(address, forKey: self.addressKey)
                    keyData.resetBytes(in: 0..<keyData.count)
                    self.resolveOnMain(call, ["address": address])
                } catch {
                    keyData.resetBytes(in: 0..<keyData.count)
                    self.deleteKey()
                    UserDefaults.standard.removeObject(forKey: self.payloadKey)
                    UserDefaults.standard.removeObject(forKey: self.addressKey)
                    self.rejectOnMain(call, "The encrypted vault could not be saved.", "vault_save_failed", error)
                }
            }
        }
    }

    @objc public func unlock(_ call: CAPPluginCall) {
        openVault(call, removeAfter: false, authorizeSpend: false)
    }

    @objc public func authorize(_ call: CAPPluginCall) {
        openVault(call, removeAfter: false, authorizeSpend: true)
    }

    @objc public func remove(_ call: CAPPluginCall) {
        openVault(call, removeAfter: true, authorizeSpend: false)
    }

    private func openVault(_ call: CAPPluginCall, removeAfter: Bool, authorizeSpend: Bool) {
        let defaults = UserDefaults.standard
        guard let encoded = defaults.string(forKey: payloadKey),
              let combined = Data(base64Encoded: encoded),
              let address = defaults.string(forKey: addressKey),
              keyExists() else {
            call.reject("No complete wallet vault exists on this device.", "vault_missing")
            return
        }

        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let reason = removeAfter
                    ? "Confirm permanent removal of Stream Wallet"
                    : authorizeSpend ? "Authorize this ZKAS mainnet payment" : "Unlock Stream Wallet"
                var keyData = try self.loadKey(reason: reason)
                defer { keyData.resetBytes(in: 0..<keyData.count) }
                let key = SymmetricKey(data: keyData)
                let box = try AES.GCM.SealedBox(combined: combined)
                var plaintext = try AES.GCM.open(box, using: key)
                defer { plaintext.resetBytes(in: 0..<plaintext.count) }
                if let legacyMnemonic = String(data: plaintext, encoding: .utf8),
                   !legacyMnemonic.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("{"),
                   legacyMnemonic.split(whereSeparator: { $0.isWhitespace }).count == 12 {
                    if removeAfter {
                        defaults.removeObject(forKey: self.payloadKey)
                        defaults.removeObject(forKey: self.addressKey)
                        self.deleteKey()
                        self.resolveOnMain(call, ["removed": true])
                        return
                    }
                    throw VaultError.upgradeRequired
                }
                guard let payload = try JSONSerialization.jsonObject(with: plaintext) as? [String: Any],
                      let mnemonic = payload["mnemonic"] as? String,
                      mnemonic.split(whereSeparator: { $0.isWhitespace }).count == 12,
                      let payloadAddress = payload["address"] as? String,
                      payloadAddress == address,
                      let accountSeedHex = payload["accountSeedHex"] as? String,
                      self.isHex(accountSeedHex, count: 64),
                      let fvkHex = payload["fvkHex"] as? String,
                      self.isHex(fvkHex, count: 192),
                      let walletToken = payload["walletToken"] as? String,
                      self.isHex(walletToken, count: 32) else {
                    throw VaultError.invalidPlaintext
                }
                let birthdayDaa = payload["birthdayDaa"] as? Int ?? 0

                if removeAfter {
                    defaults.removeObject(forKey: self.payloadKey)
                    defaults.removeObject(forKey: self.addressKey)
                    self.deleteKey()
                    self.resolveOnMain(call, ["removed": true])
                } else if authorizeSpend {
                    self.resolveOnMain(call, [
                        "address": address,
                        "accountSeedHex": accountSeedHex
                    ])
                } else {
                    self.resolveOnMain(call, [
                        "address": address,
                        "fvkHex": fvkHex,
                        "walletToken": walletToken,
                        "birthdayDaa": birthdayDaa
                    ])
                }
            } catch VaultError.authenticationFailed(let status) {
                let error = NSError(domain: NSOSStatusErrorDomain, code: Int(status))
                self.rejectOnMain(call, "Device authentication was cancelled or failed.", "authentication_cancelled", error)
            } catch let error as NSError where error.domain == LAError.errorDomain {
                self.rejectOnMain(call, error.localizedDescription, "authentication_cancelled", error)
            } catch VaultError.upgradeRequired {
                self.rejectOnMain(call, "This pre-mainnet vault must be removed and restored from its recovery phrase.", "vault_upgrade_required")
            } catch {
                self.rejectOnMain(call,
                    removeAfter ? "The wallet could not be removed." : "The wallet could not be unlocked.",
                    removeAfter ? "vault_remove_failed" : "vault_unlock_failed",
                    error)
            }
        }
    }

    private func authenticate(reason: String, completion: @escaping (Bool, Error?) -> Void) {
        let context = LAContext()
        context.localizedCancelTitle = "Cancel"
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, error in
            DispatchQueue.main.async { completion(success, error) }
        }
    }

    private func storeKey(_ key: Data) throws {
        var accessError: Unmanaged<CFError>?
        guard let access = SecAccessControlCreateWithFlags(
            nil,
            kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
            .userPresence,
            &accessError
        ) else {
            throw accessError?.takeRetainedValue() ?? VaultError.keychainFailure(errSecParam)
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrSynchronizable as String: false,
            kSecAttrAccessControl as String: access,
            kSecValueData as String: key
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw VaultError.keychainFailure(status) }
    }

    private func loadKey(reason: String) throws -> Data {
        let context = LAContext()
        context.localizedReason = reason
        context.localizedCancelTitle = "Cancel"
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnData as String: true,
            kSecUseAuthenticationContext as String: context
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            if status == errSecUserCanceled || status == errSecAuthFailed || status == errSecInteractionNotAllowed {
                throw VaultError.authenticationFailed(status)
            }
            throw VaultError.keychainFailure(status)
        }
        return data
    }

    private func keyExists() -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecReturnAttributes as String: true,
            kSecUseAuthenticationUI as String: kSecUseAuthenticationUIFail
        ]
        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }

    private func deleteKey() {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }

    private func isHex(_ value: String, count: Int) -> Bool {
        guard value.count == count else { return false }
        return value.allSatisfy { $0.isHexDigit }
    }

    private func resolveOnMain(_ call: CAPPluginCall, _ value: [String: Any]) {
        DispatchQueue.main.async { call.resolve(value) }
    }

    private func rejectOnMain(_ call: CAPPluginCall, _ message: String, _ code: String, _ error: Error? = nil) {
        DispatchQueue.main.async { call.reject(message, code, error) }
    }
}

private enum VaultError: Error {
    case invalidCiphertext
    case invalidPlaintext
    case authenticationFailed(OSStatus)
    case keychainFailure(OSStatus)
    case upgradeRequired
}
