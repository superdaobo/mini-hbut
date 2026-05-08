#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// 使用 Capacitor 标准宏将 Swift 插件方法暴露给 JS 层
CAP_PLUGIN(MiniHbutWidgetPlugin, "MiniHbutWidget",
    CAP_PLUGIN_METHOD(writeSnapshot, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(clearSnapshot, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(requestRefresh, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getCapabilities, CAPPluginReturnPromise);
)
