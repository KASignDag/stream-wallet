#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(SecureVaultPlugin, "SecureVault",
    CAP_PLUGIN_METHOD(status, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(save, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(unlock, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(authorize, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(remove, CAPPluginReturnPromise);
)
