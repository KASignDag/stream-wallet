export interface QrScannerApi {
  scanAddress(): Promise<string | null>;
}

export const qrScanner: QrScannerApi = {
  async scanAddress() {
    const {
      CapacitorBarcodeScanner,
      CapacitorBarcodeScannerCameraDirection,
      CapacitorBarcodeScannerScanOrientation,
      CapacitorBarcodeScannerTypeHint,
    } = await import("@capacitor/barcode-scanner");
    const result = await CapacitorBarcodeScanner.scanBarcode({
      hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
      cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
      scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
      scanInstructions: "Scan a ZKAS mainnet address",
      scanButton: false,
      cancelButtonAccessibilityLabel: "Cancel QR code scan",
      torchButtonOnAccessibilityLabel: "Turn flashlight on",
      torchButtonOffAccessibilityLabel: "Turn flashlight off",
    });

    const value = result.ScanResult.trim();
    return value || null;
  },
};
