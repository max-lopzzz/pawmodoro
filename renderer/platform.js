window.platformControls = window.Capacitor
  ? {
      minimize: function () {},
      close: function () {},
      openExternal: function (url) {
        window.Capacitor.nativePromise('Browser', 'open', { url: url })
      }
    }
  : window.windowControls
