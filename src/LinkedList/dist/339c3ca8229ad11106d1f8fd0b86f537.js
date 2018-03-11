// modules are defined as an array
// [ module function, map of requires ]
//
// map of requires is short require name -> numeric require
//
// anything defined in a previous bundle is accessed via the
// orig method which is the require for previous bundles

require = (function (modules, cache, entry) {
  // Save the require from previous bundle to this closure if any
  var previousRequire = typeof require === "function" && require;

  function newRequire(name, jumped) {
    if (!cache[name]) {
      if (!modules[name]) {
        // if we cannot find the module within our internal map or
        // cache jump to the current global require ie. the last bundle
        // that was added to the page.
        var currentRequire = typeof require === "function" && require;
        if (!jumped && currentRequire) {
          return currentRequire(name, true);
        }

        // If there are other bundles on this page the require from the
        // previous one is saved to 'previousRequire'. Repeat this as
        // many times as there are bundles until the module is found or
        // we exhaust the require chain.
        if (previousRequire) {
          return previousRequire(name, true);
        }

        var err = new Error('Cannot find module \'' + name + '\'');
        err.code = 'MODULE_NOT_FOUND';
        throw err;
      }
      
      localRequire.resolve = resolve;

      var module = cache[name] = new newRequire.Module;

      modules[name][0].call(module.exports, localRequire, module, module.exports);
    }

    return cache[name].exports;

    function localRequire(x){
      return newRequire(localRequire.resolve(x));
    }

    function resolve(x){
      return modules[name][1][x] || x;
    }
  }

  function Module() {
    this.bundle = newRequire;
    this.exports = {};
  }

  newRequire.Module = Module;
  newRequire.modules = modules;
  newRequire.cache = cache;
  newRequire.parent = previousRequire;

  for (var i = 0; i < entry.length; i++) {
    newRequire(entry[i]);
  }

  // Override the current require with this new one
  return newRequire;
})({5:[function(require,module,exports) {
"use strict";
exports.__esModule = true;
var Node = /** @class */ (function () {
    function Node(element, next) {
        this.element = element;
        this.next = next;
    }
    return Node;
}());
exports["default"] = Node;

},{}],4:[function(require,module,exports) {
"use strict";
exports.__esModule = true;
var Node_1 = require("./Node");
var LinkedList = /** @class */ (function () {
    function LinkedList() {
        this.length = 0;
        this.head = null;
    }
    LinkedList.prototype.append = function (element) {
        var node = new Node_1["default"](element);
        var current;
        // 列表为空时添加为第一个元素
        if (this.head === null) {
            this.head = node;
        }
        else {
            current = this.head;
            while (current.next) {
                current = current.next;
            }
            current.next = node;
        }
        this.length += 1;
    };
    LinkedList.prototype.insert = function (position, element) {
        if (position >= 0 && position <= this.length) {
            var node = new Node_1["default"](element);
            var current = this.head;
            var previous = void 0;
            var index = 0;
            // 当position为0 则在第一个位置添加新元素
            if (position === 0) {
                node.next = current;
                this.head = node;
            }
            else {
                while (index++ < position) {
                    previous = current;
                    current = current.next;
                }
                node.next = current;
                previous.next = node;
            }
            this.length += 1;
            return true;
        }
        else {
            return false;
        }
    };
    LinkedList.prototype.removeAt = function (position) {
        if (position > -1 && position < this.length) {
            var current = this.head;
            var previous = void 0;
            var index = 0;
            // 移除第一项
            if (position === 0) {
                this.head = current.next;
            }
            else {
                /**
                 * 移除列表最后一项或中间某一项时, 需要依靠一个细节来迭代列表,直到到达目标位置
                 * 使用一个内部递增的index变量, current变量为所循环列表的当前元素进行引用
                 */
                while (index++ < position) {
                    previous = current;
                    current = current.next;
                }
                previous.next = current.next;
            }
            this.length -= 1;
            return current.element;
        }
        else {
            return null;
        }
    };
    LinkedList.prototype.toString = function () {
        var current = this.head;
        var string = '';
        while (current) {
            string += current.element.name + (current.next ? '\n' : '');
            current = current.next;
        }
        return string;
    };
    LinkedList.prototype.indexOf = function (element) {
        var current = this.head;
        var index = -1;
        while (current) {
            if (element === current.element) {
                return index;
            }
            index += 1;
            current = current.next;
        }
        return -1;
    };
    LinkedList.prototype.remove = function (element) {
        var index = this.indexOf(element);
        return this.removeAt(index);
    };
    LinkedList.prototype.isEmpty = function () {
        return this.length === 0;
    };
    LinkedList.prototype.size = function () {
        return this.length;
    };
    LinkedList.prototype.getHead = function () {
        return this.head;
    };
    return LinkedList;
}());
var linkedList = new LinkedList();
linkedList.append({ name: 'sakura' });
linkedList.append({ name: 'misaka' });
linkedList.append({ name: 'mikoto' });
linkedList.append({ name: 'yahaha' });
console.log(linkedList);
// const data = linkedList.removeAt(0);
linkedList.insert(2, { name: 'javascript' });
console.log(linkedList);
console.log(linkedList.toString());

},{"./Node":5}],0:[function(require,module,exports) {
var global = (1, eval)('this');
var OldModule = module.bundle.Module;
function Module() {
  OldModule.call(this);
  this.hot = {
    accept: function (fn) {
      this._acceptCallback = fn || function () {};
    },
    dispose: function (fn) {
      this._disposeCallback = fn;
    }
  };
}

module.bundle.Module = Module;

if (!module.bundle.parent && typeof WebSocket !== 'undefined') {
  var ws = new WebSocket('ws://localhost:56526/');
  ws.onmessage = function(event) {
    var data = JSON.parse(event.data);

    if (data.type === 'update') {
      data.assets.forEach(function (asset) {
        hmrApply(global.require, asset);
      });

      data.assets.forEach(function (asset) {
        if (!asset.isNew) {
          hmrAccept(global.require, asset.id);
        }
      });
    }

    if (data.type === 'reload') {
      ws.close();
      ws.onclose = function () {
        window.location.reload();
      }
    }

    if (data.type === 'error-resolved') {
      console.log('[parcel] ✨ Error resolved');
    }

    if (data.type === 'error') {
      console.error('[parcel] 🚨  ' + data.error.message + '\n' + 'data.error.stack');
    }
  };
}

function getParents(bundle, id) {
  var modules = bundle.modules;
  if (!modules) {
    return [];
  }

  var parents = [];
  var k, d, dep;

  for (k in modules) {
    for (d in modules[k][1]) {
      dep = modules[k][1][d];
      if (dep === id || (Array.isArray(dep) && dep[dep.length - 1] === id)) {
        parents.push(+k);
      }
    }
  }

  if (bundle.parent) {
    parents = parents.concat(getParents(bundle.parent, id));
  }

  return parents;
}

function hmrApply(bundle, asset) {
  var modules = bundle.modules;
  if (!modules) {
    return;
  }

  if (modules[asset.id] || !bundle.parent) {
    var fn = new Function('require', 'module', 'exports', asset.generated.js);
    asset.isNew = !modules[asset.id];
    modules[asset.id] = [fn, asset.deps];
  } else if (bundle.parent) {
    hmrApply(bundle.parent, asset);
  }
}

function hmrAccept(bundle, id) {
  var modules = bundle.modules;
  if (!modules) {
    return;
  }

  if (!modules[id] && bundle.parent) {
    return hmrAccept(bundle.parent, id);
  }

  var cached = bundle.cache[id];
  if (cached && cached.hot._disposeCallback) {
    cached.hot._disposeCallback();
  }

  delete bundle.cache[id];
  bundle(id);

  cached = bundle.cache[id];
  if (cached && cached.hot && cached.hot._acceptCallback) {
    cached.hot._acceptCallback();
    return true;
  }

  return getParents(global.require, id).some(function (id) {
    return hmrAccept(global.require, id)
  });
}
},{}]},{},[0,4])