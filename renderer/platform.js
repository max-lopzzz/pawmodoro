window.platformControls = window.Capacitor
  ? {
      minimize: function () {},
      close: function () {},
      openExternal: function (url) {
        window.Capacitor.Plugins.Browser.open({ url: url })
      }
    }
  : window.windowControls
