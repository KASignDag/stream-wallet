package stream.zkas.wallet.security;

import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.concurrent.Executor;

import org.json.JSONObject;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureVault")
public class SecureVaultPlugin extends Plugin {
    private static final String KEY_ALIAS = "stream.wallet.vault.v1";
    private static final String PREFS = "stream_wallet_vault";
    private static final String FIELD_CIPHERTEXT = "ciphertext";
    private static final String FIELD_IV = "iv";
    private static final String FIELD_ADDRESS = "address";
    private static final String CIPHER = "AES/GCM/NoPadding";

    @PluginMethod
    public void status(PluginCall call) {
        SharedPreferences prefs = prefs();
        boolean exists = prefs.contains(FIELD_CIPHERTEXT)
                && prefs.contains(FIELD_IV)
                && prefs.contains(FIELD_ADDRESS)
                && keyExists();
        int capability = BiometricManager.from(getContext()).canAuthenticate(authenticators());

        JSObject result = new JSObject();
        result.put("available", capability == BiometricManager.BIOMETRIC_SUCCESS);
        result.put("exists", exists);
        result.put("platform", "android");
        result.put("protection", Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                ? "biometric-or-device-credential"
                : "strong-biometric");
        if (exists) result.put("address", prefs.getString(FIELD_ADDRESS, ""));
        call.resolve(result);
    }

    @PluginMethod
    public void save(PluginCall call) {
        String mnemonic = call.getString("mnemonic");
        String address = call.getString("address");
        String accountSeedHex = call.getString("accountSeedHex");
        String fvkHex = call.getString("fvkHex");
        String walletToken = call.getString("walletToken");
        int birthdayDaa = Math.max(0, call.getInt("birthdayDaa", 0));
        if (mnemonic == null || mnemonic.trim().split("\\s+").length != 12) {
            call.reject("A validated 12-word recovery phrase is required.", "invalid_mnemonic");
            return;
        }
        if (address == null || !address.startsWith("zkas:")) {
            call.reject("A validated ZKAS mainnet address is required.", "invalid_address");
            return;
        }
        if (!isHex(accountSeedHex, 64) || !isHex(fvkHex, 192) || !isHex(walletToken, 32)) {
            call.reject("Validated mainnet wallet material is required.", "invalid_wallet_material");
            return;
        }
        if (prefs().contains(FIELD_CIPHERTEXT) || keyExists()) {
            call.reject("A wallet already exists on this device.", "vault_exists");
            return;
        }

        try {
            SecretKey key = generateKey();
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.ENCRYPT_MODE, key);
            authenticate(call, cipher, "Protect Stream Wallet", "Confirm to encrypt this recovery phrase", authenticated -> {
                byte[] plaintext = null;
                try {
                    JSONObject payload = new JSONObject();
                    payload.put("version", 2);
                    payload.put("mnemonic", mnemonic.trim().replaceAll("\\s+", " "));
                    payload.put("address", address);
                    payload.put("accountSeedHex", accountSeedHex.toLowerCase());
                    payload.put("fvkHex", fvkHex.toLowerCase());
                    payload.put("walletToken", walletToken.toLowerCase());
                    payload.put("birthdayDaa", birthdayDaa);
                    plaintext = payload.toString().getBytes(StandardCharsets.UTF_8);
                    byte[] encrypted = authenticated.doFinal(plaintext);
                    boolean saved = prefs().edit()
                            .putString(FIELD_CIPHERTEXT, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                            .putString(FIELD_IV, Base64.encodeToString(authenticated.getIV(), Base64.NO_WRAP))
                            .putString(FIELD_ADDRESS, address)
                            .commit();
                    Arrays.fill(encrypted, (byte) 0);
                    if (!saved) throw new IllegalStateException("Encrypted vault could not be committed.");
                    JSObject result = new JSObject();
                    result.put("address", address);
                    call.resolve(result);
                } catch (Exception error) {
                    deleteKey();
                    prefs().edit().clear().commit();
                    call.reject("The encrypted vault could not be saved.", "vault_save_failed", error);
                } finally {
                    if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
                }
            }, this::deleteKey);
        } catch (Exception error) {
            deleteKey();
            call.reject("Secure device storage could not be initialized.", "secure_storage_unavailable", error);
        }
    }

    @PluginMethod
    public void unlock(PluginCall call) {
        decryptAfterAuthentication(call, "Unlock Stream Wallet", "Confirm to open this wallet", false, false);
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        decryptAfterAuthentication(call, "Authorize ZKAS payment", "Confirm this mainnet transaction", false, true);
    }

    @PluginMethod
    public void remove(PluginCall call) {
        decryptAfterAuthentication(call, "Remove Stream Wallet", "Confirm permanent removal from this device", true, false);
    }

    private void decryptAfterAuthentication(PluginCall call, String title, String subtitle, boolean removeAfter, boolean authorizeSpend) {
        SharedPreferences prefs = prefs();
        String ciphertext = prefs.getString(FIELD_CIPHERTEXT, null);
        String iv = prefs.getString(FIELD_IV, null);
        String address = prefs.getString(FIELD_ADDRESS, null);
        if (ciphertext == null || iv == null || address == null || !keyExists()) {
            call.reject("No complete wallet vault exists on this device.", "vault_missing");
            return;
        }

        try {
            SecretKey key = loadKey();
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.DECRYPT_MODE, key,
                    new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
            authenticate(call, cipher, title, subtitle, authenticated -> {
                byte[] encrypted = Base64.decode(ciphertext, Base64.NO_WRAP);
                byte[] plaintext = null;
                try {
                    plaintext = authenticated.doFinal(encrypted);
                    String decoded = new String(plaintext, StandardCharsets.UTF_8);
                    if (decoded.trim().split("\\s+").length == 12 && !decoded.trim().startsWith("{")) {
                        if (removeAfter) {
                            if (!prefs.edit().clear().commit()) {
                                throw new IllegalStateException("Vault data could not be removed.");
                            }
                            deleteKey();
                            JSObject removed = new JSObject();
                            removed.put("removed", true);
                            call.resolve(removed);
                        } else {
                            call.reject("This pre-mainnet vault must be removed and restored from its recovery phrase.",
                                    "vault_upgrade_required");
                        }
                        return;
                    }
                    JSONObject payload = new JSONObject(decoded);
                    String mnemonic = payload.optString("mnemonic", "");
                    String payloadAddress = payload.optString("address", "");
                    String accountSeedHex = payload.optString("accountSeedHex", "");
                    String fvkHex = payload.optString("fvkHex", "");
                    String walletToken = payload.optString("walletToken", "");
                    int birthdayDaa = Math.max(0, payload.optInt("birthdayDaa", 0));
                    if (mnemonic.trim().split("\\s+").length != 12
                            || !address.equals(payloadAddress)
                            || !isHex(accountSeedHex, 64)
                            || !isHex(fvkHex, 192)
                            || !isHex(walletToken, 32)) {
                        throw new IllegalStateException("Decrypted vault contents are invalid.");
                    }
                    JSObject result = new JSObject();
                    if (removeAfter) {
                        if (!prefs.edit().clear().commit()) {
                            throw new IllegalStateException("Vault data could not be removed.");
                        }
                        deleteKey();
                        result.put("removed", true);
                    } else if (authorizeSpend) {
                        result.put("address", address);
                        result.put("accountSeedHex", accountSeedHex);
                    } else {
                        result.put("address", address);
                        result.put("fvkHex", fvkHex);
                        result.put("walletToken", walletToken);
                        result.put("birthdayDaa", birthdayDaa);
                    }
                    call.resolve(result);
                } catch (Exception error) {
                    call.reject(removeAfter ? "The wallet could not be removed." : "The wallet could not be unlocked.",
                            removeAfter ? "vault_remove_failed" : "vault_unlock_failed", error);
                } finally {
                    Arrays.fill(encrypted, (byte) 0);
                    if (plaintext != null) Arrays.fill(plaintext, (byte) 0);
                }
            }, null);
        } catch (KeyPermanentlyInvalidatedException error) {
            call.reject("Device security changed and invalidated the vault key. Restore from the recovery phrase.",
                    "vault_key_invalidated", error);
        } catch (Exception error) {
            call.reject("The secure vault could not be opened.", "vault_unlock_failed", error);
        }
    }

    private void authenticate(
            PluginCall call,
            Cipher cipher,
            String title,
            String subtitle,
            CipherConsumer onSuccess,
            Runnable onFailure
    ) {
        FragmentActivity activity = (FragmentActivity) getActivity();
        Executor executor = ContextCompat.getMainExecutor(getContext());
        BiometricPrompt prompt = new BiometricPrompt(activity, executor, new BiometricPrompt.AuthenticationCallback() {
            @Override
            public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
                if (onFailure != null) onFailure.run();
                call.reject(errString.toString(), "authentication_cancelled");
            }

            @Override
            public void onAuthenticationSucceeded(@NonNull BiometricPrompt.AuthenticationResult result) {
                Cipher authenticated = result.getCryptoObject() == null ? null : result.getCryptoObject().getCipher();
                if (authenticated == null) {
                    if (onFailure != null) onFailure.run();
                    call.reject("Device authentication returned no cryptographic authorization.", "authentication_failed");
                    return;
                }
                onSuccess.accept(authenticated);
            }

            @Override
            public void onAuthenticationFailed() {
                // The system prompt stays open and allows another attempt.
            }
        });

        BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setConfirmationRequired(true)
                .setAllowedAuthenticators(authenticators());
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) info.setNegativeButtonText("Cancel");
        prompt.authenticate(info.build(), new BiometricPrompt.CryptoObject(cipher));
    }

    private SecretKey generateKey() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .setUserAuthenticationRequired(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            spec.setUserAuthenticationParameters(0,
                    KeyProperties.AUTH_BIOMETRIC_STRONG | KeyProperties.AUTH_DEVICE_CREDENTIAL);
        } else {
            spec.setUserAuthenticationValidityDurationSeconds(-1);
        }
        generator.init(spec.build());
        return generator.generateKey();
    }

    private SecretKey loadKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }

    private boolean keyExists() {
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            return store.containsAlias(KEY_ALIAS);
        } catch (Exception ignored) {
            return false;
        }
    }

    private void deleteKey() {
        try {
            KeyStore store = KeyStore.getInstance("AndroidKeyStore");
            store.load(null);
            if (store.containsAlias(KEY_ALIAS)) store.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // A failed cleanup is surfaced the next time status/save checks the alias.
        }
    }

    private int authenticators() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            return BiometricManager.Authenticators.BIOMETRIC_STRONG
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
        }
        return BiometricManager.Authenticators.BIOMETRIC_STRONG;
    }

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, 0);
    }

    private boolean isHex(String value, int length) {
        return value != null && value.length() == length && value.matches("[0-9a-fA-F]+$");
    }

    private interface CipherConsumer {
        void accept(Cipher cipher);
    }
}
