(() => {
  "use strict";
  const NativeObserver = window.MutationObserver;
  if (!NativeObserver || NativeObserver.__ml3dAvatarSafe) return;

  class ML3DSafeObserver extends NativeObserver {
    constructor(callback) {
      let instance = null;
      super((mutations, observer) => {
        if (instance?._ml3dTarget?.id !== "playersLayer") {
          callback(mutations, observer);
          return;
        }
        const relevant = mutations.filter((m) => {
          if (m.type === "childList") return m.target === instance._ml3dTarget;
          if (m.type === "attributes") return m.target?.classList?.contains("player");
          return false;
        });
        if (relevant.length) callback(relevant, observer);
      });
      instance = this;
    }
    observe(target, options) {
      this._ml3dTarget = target;
      return super.observe(target, options);
    }
  }
  ML3DSafeObserver.__ml3dAvatarSafe = true;
  window.MutationObserver = ML3DSafeObserver;
})();
