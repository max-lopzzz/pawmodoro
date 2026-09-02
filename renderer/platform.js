window.platformControls = window.Capacitor
  ? {
      minimize: function () {},
      close: function () {},
      openExternal: function (url) {
        window.Capacitor.nativePromise('Browser', 'open', { url: url })
      }
    }
  : window.windowControls || {
      minimize: function () {},
      close: function () {},
      openExternal: function (url) {
        window.open(url, '_blank', 'noopener')
      }
    }

if (!window.Capacitor && !window.windowControls) {
  document.body.classList.add('web')
}
