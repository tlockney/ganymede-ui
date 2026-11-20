(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/ts-interface-checker/dist/util.js
  var require_util = __commonJS({
    "node_modules/ts-interface-checker/dist/util.js"(exports) {
      "use strict";
      var __extends = exports && exports.__extends || /* @__PURE__ */ (function() {
        var extendStatics = function(d, b) {
          extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
            d2.__proto__ = b2;
          } || function(d2, b2) {
            for (var p in b2) if (b2.hasOwnProperty(p)) d2[p] = b2[p];
          };
          return extendStatics(d, b);
        };
        return function(d, b) {
          extendStatics(d, b);
          function __() {
            this.constructor = d;
          }
          d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
      })();
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.DetailContext = exports.NoopContext = exports.VError = void 0;
      var VError = (
        /** @class */
        (function(_super) {
          __extends(VError2, _super);
          function VError2(path, message) {
            var _this = _super.call(this, message) || this;
            _this.path = path;
            Object.setPrototypeOf(_this, VError2.prototype);
            return _this;
          }
          return VError2;
        })(Error)
      );
      exports.VError = VError;
      var NoopContext = (
        /** @class */
        (function() {
          function NoopContext2() {
          }
          NoopContext2.prototype.fail = function(relPath, message, score) {
            return false;
          };
          NoopContext2.prototype.unionResolver = function() {
            return this;
          };
          NoopContext2.prototype.createContext = function() {
            return this;
          };
          NoopContext2.prototype.resolveUnion = function(ur) {
          };
          return NoopContext2;
        })()
      );
      exports.NoopContext = NoopContext;
      var DetailContext = (
        /** @class */
        (function() {
          function DetailContext2() {
            this._propNames = [""];
            this._messages = [null];
            this._score = 0;
          }
          DetailContext2.prototype.fail = function(relPath, message, score) {
            this._propNames.push(relPath);
            this._messages.push(message);
            this._score += score;
            return false;
          };
          DetailContext2.prototype.unionResolver = function() {
            return new DetailUnionResolver();
          };
          DetailContext2.prototype.resolveUnion = function(unionResolver) {
            var _a, _b;
            var u = unionResolver;
            var best = null;
            for (var _i = 0, _c = u.contexts; _i < _c.length; _i++) {
              var ctx = _c[_i];
              if (!best || ctx._score >= best._score) {
                best = ctx;
              }
            }
            if (best && best._score > 0) {
              (_a = this._propNames).push.apply(_a, best._propNames);
              (_b = this._messages).push.apply(_b, best._messages);
            }
          };
          DetailContext2.prototype.getError = function(path) {
            var msgParts = [];
            for (var i = this._propNames.length - 1; i >= 0; i--) {
              var p = this._propNames[i];
              path += typeof p === "number" ? "[" + p + "]" : p ? "." + p : "";
              var m = this._messages[i];
              if (m) {
                msgParts.push(path + " " + m);
              }
            }
            return new VError(path, msgParts.join("; "));
          };
          DetailContext2.prototype.getErrorDetail = function(path) {
            var details = [];
            for (var i = this._propNames.length - 1; i >= 0; i--) {
              var p = this._propNames[i];
              path += typeof p === "number" ? "[" + p + "]" : p ? "." + p : "";
              var message = this._messages[i];
              if (message) {
                details.push({ path, message });
              }
            }
            var detail = null;
            for (var i = details.length - 1; i >= 0; i--) {
              if (detail) {
                details[i].nested = [detail];
              }
              detail = details[i];
            }
            return detail;
          };
          return DetailContext2;
        })()
      );
      exports.DetailContext = DetailContext;
      var DetailUnionResolver = (
        /** @class */
        (function() {
          function DetailUnionResolver2() {
            this.contexts = [];
          }
          DetailUnionResolver2.prototype.createContext = function() {
            var ctx = new DetailContext();
            this.contexts.push(ctx);
            return ctx;
          };
          return DetailUnionResolver2;
        })()
      );
    }
  });

  // node_modules/ts-interface-checker/dist/types.js
  var require_types = __commonJS({
    "node_modules/ts-interface-checker/dist/types.js"(exports) {
      "use strict";
      var __extends = exports && exports.__extends || /* @__PURE__ */ (function() {
        var extendStatics = function(d, b) {
          extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
            d2.__proto__ = b2;
          } || function(d2, b2) {
            for (var p in b2) if (b2.hasOwnProperty(p)) d2[p] = b2[p];
          };
          return extendStatics(d, b);
        };
        return function(d, b) {
          extendStatics(d, b);
          function __() {
            this.constructor = d;
          }
          d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
      })();
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.basicTypes = exports.BasicType = exports.TParamList = exports.TParam = exports.param = exports.TFunc = exports.func = exports.TProp = exports.TOptional = exports.opt = exports.TIface = exports.iface = exports.TEnumLiteral = exports.enumlit = exports.TEnumType = exports.enumtype = exports.TIntersection = exports.intersection = exports.TUnion = exports.union = exports.TTuple = exports.tuple = exports.TArray = exports.array = exports.TLiteral = exports.lit = exports.TName = exports.name = exports.TType = void 0;
      var util_1 = require_util();
      var TType = (
        /** @class */
        /* @__PURE__ */ (function() {
          function TType2() {
          }
          return TType2;
        })()
      );
      exports.TType = TType;
      function parseSpec(typeSpec) {
        return typeof typeSpec === "string" ? name(typeSpec) : typeSpec;
      }
      function getNamedType(suite, name2) {
        var ttype = suite[name2];
        if (!ttype) {
          throw new Error("Unknown type " + name2);
        }
        return ttype;
      }
      function name(value) {
        return new TName(value);
      }
      exports.name = name;
      var TName = (
        /** @class */
        (function(_super) {
          __extends(TName2, _super);
          function TName2(name2) {
            var _this = _super.call(this) || this;
            _this.name = name2;
            _this._failMsg = "is not a " + name2;
            return _this;
          }
          TName2.prototype.getChecker = function(suite, strict, allowedProps) {
            var _this = this;
            var ttype = getNamedType(suite, this.name);
            var checker = ttype.getChecker(suite, strict, allowedProps);
            if (ttype instanceof BasicType || ttype instanceof TName2) {
              return checker;
            }
            return function(value, ctx) {
              return checker(value, ctx) ? true : ctx.fail(null, _this._failMsg, 0);
            };
          };
          return TName2;
        })(TType)
      );
      exports.TName = TName;
      function lit2(value) {
        return new TLiteral(value);
      }
      exports.lit = lit2;
      var TLiteral = (
        /** @class */
        (function(_super) {
          __extends(TLiteral2, _super);
          function TLiteral2(value) {
            var _this = _super.call(this) || this;
            _this.value = value;
            _this.name = JSON.stringify(value);
            _this._failMsg = "is not " + _this.name;
            return _this;
          }
          TLiteral2.prototype.getChecker = function(suite, strict) {
            var _this = this;
            return function(value, ctx) {
              return value === _this.value ? true : ctx.fail(null, _this._failMsg, -1);
            };
          };
          return TLiteral2;
        })(TType)
      );
      exports.TLiteral = TLiteral;
      function array2(typeSpec) {
        return new TArray(parseSpec(typeSpec));
      }
      exports.array = array2;
      var TArray = (
        /** @class */
        (function(_super) {
          __extends(TArray2, _super);
          function TArray2(ttype) {
            var _this = _super.call(this) || this;
            _this.ttype = ttype;
            return _this;
          }
          TArray2.prototype.getChecker = function(suite, strict) {
            var itemChecker = this.ttype.getChecker(suite, strict);
            return function(value, ctx) {
              if (!Array.isArray(value)) {
                return ctx.fail(null, "is not an array", 0);
              }
              for (var i = 0; i < value.length; i++) {
                var ok = itemChecker(value[i], ctx);
                if (!ok) {
                  return ctx.fail(i, null, 1);
                }
              }
              return true;
            };
          };
          return TArray2;
        })(TType)
      );
      exports.TArray = TArray;
      function tuple() {
        var typeSpec = [];
        for (var _i2 = 0; _i2 < arguments.length; _i2++) {
          typeSpec[_i2] = arguments[_i2];
        }
        return new TTuple(typeSpec.map(function(t2) {
          return parseSpec(t2);
        }));
      }
      exports.tuple = tuple;
      var TTuple = (
        /** @class */
        (function(_super) {
          __extends(TTuple2, _super);
          function TTuple2(ttypes) {
            var _this = _super.call(this) || this;
            _this.ttypes = ttypes;
            return _this;
          }
          TTuple2.prototype.getChecker = function(suite, strict) {
            var itemCheckers = this.ttypes.map(function(t2) {
              return t2.getChecker(suite, strict);
            });
            var checker = function(value, ctx) {
              if (!Array.isArray(value)) {
                return ctx.fail(null, "is not an array", 0);
              }
              for (var i = 0; i < itemCheckers.length; i++) {
                var ok = itemCheckers[i](value[i], ctx);
                if (!ok) {
                  return ctx.fail(i, null, 1);
                }
              }
              return true;
            };
            if (!strict) {
              return checker;
            }
            return function(value, ctx) {
              if (!checker(value, ctx)) {
                return false;
              }
              return value.length <= itemCheckers.length ? true : ctx.fail(itemCheckers.length, "is extraneous", 2);
            };
          };
          return TTuple2;
        })(TType)
      );
      exports.TTuple = TTuple;
      function union2() {
        var typeSpec = [];
        for (var _i2 = 0; _i2 < arguments.length; _i2++) {
          typeSpec[_i2] = arguments[_i2];
        }
        return new TUnion(typeSpec.map(function(t2) {
          return parseSpec(t2);
        }));
      }
      exports.union = union2;
      var TUnion = (
        /** @class */
        (function(_super) {
          __extends(TUnion2, _super);
          function TUnion2(ttypes) {
            var _this = _super.call(this) || this;
            _this.ttypes = ttypes;
            var names = ttypes.map(function(t2) {
              return t2 instanceof TName || t2 instanceof TLiteral ? t2.name : null;
            }).filter(function(n) {
              return n;
            });
            var otherTypes = ttypes.length - names.length;
            if (names.length) {
              if (otherTypes > 0) {
                names.push(otherTypes + " more");
              }
              _this._failMsg = "is none of " + names.join(", ");
            } else {
              _this._failMsg = "is none of " + otherTypes + " types";
            }
            return _this;
          }
          TUnion2.prototype.getChecker = function(suite, strict) {
            var _this = this;
            var itemCheckers = this.ttypes.map(function(t2) {
              return t2.getChecker(suite, strict);
            });
            return function(value, ctx) {
              var ur = ctx.unionResolver();
              for (var i = 0; i < itemCheckers.length; i++) {
                var ok = itemCheckers[i](value, ur.createContext());
                if (ok) {
                  return true;
                }
              }
              ctx.resolveUnion(ur);
              return ctx.fail(null, _this._failMsg, 0);
            };
          };
          return TUnion2;
        })(TType)
      );
      exports.TUnion = TUnion;
      function intersection() {
        var typeSpec = [];
        for (var _i2 = 0; _i2 < arguments.length; _i2++) {
          typeSpec[_i2] = arguments[_i2];
        }
        return new TIntersection(typeSpec.map(function(t2) {
          return parseSpec(t2);
        }));
      }
      exports.intersection = intersection;
      var TIntersection = (
        /** @class */
        (function(_super) {
          __extends(TIntersection2, _super);
          function TIntersection2(ttypes) {
            var _this = _super.call(this) || this;
            _this.ttypes = ttypes;
            return _this;
          }
          TIntersection2.prototype.getChecker = function(suite, strict) {
            var allowedProps = /* @__PURE__ */ new Set();
            var itemCheckers = this.ttypes.map(function(t2) {
              return t2.getChecker(suite, strict, allowedProps);
            });
            return function(value, ctx) {
              var ok = itemCheckers.every(function(checker) {
                return checker(value, ctx);
              });
              if (ok) {
                return true;
              }
              return ctx.fail(null, null, 0);
            };
          };
          return TIntersection2;
        })(TType)
      );
      exports.TIntersection = TIntersection;
      function enumtype(values) {
        return new TEnumType(values);
      }
      exports.enumtype = enumtype;
      var TEnumType = (
        /** @class */
        (function(_super) {
          __extends(TEnumType2, _super);
          function TEnumType2(members) {
            var _this = _super.call(this) || this;
            _this.members = members;
            _this.validValues = /* @__PURE__ */ new Set();
            _this._failMsg = "is not a valid enum value";
            _this.validValues = new Set(Object.keys(members).map(function(name2) {
              return members[name2];
            }));
            return _this;
          }
          TEnumType2.prototype.getChecker = function(suite, strict) {
            var _this = this;
            return function(value, ctx) {
              return _this.validValues.has(value) ? true : ctx.fail(null, _this._failMsg, 0);
            };
          };
          return TEnumType2;
        })(TType)
      );
      exports.TEnumType = TEnumType;
      function enumlit(name2, prop) {
        return new TEnumLiteral(name2, prop);
      }
      exports.enumlit = enumlit;
      var TEnumLiteral = (
        /** @class */
        (function(_super) {
          __extends(TEnumLiteral2, _super);
          function TEnumLiteral2(enumName, prop) {
            var _this = _super.call(this) || this;
            _this.enumName = enumName;
            _this.prop = prop;
            _this._failMsg = "is not " + enumName + "." + prop;
            return _this;
          }
          TEnumLiteral2.prototype.getChecker = function(suite, strict) {
            var _this = this;
            var ttype = getNamedType(suite, this.enumName);
            if (!(ttype instanceof TEnumType)) {
              throw new Error("Type " + this.enumName + " used in enumlit is not an enum type");
            }
            var val = ttype.members[this.prop];
            if (!ttype.members.hasOwnProperty(this.prop)) {
              throw new Error("Unknown value " + this.enumName + "." + this.prop + " used in enumlit");
            }
            return function(value, ctx) {
              return value === val ? true : ctx.fail(null, _this._failMsg, -1);
            };
          };
          return TEnumLiteral2;
        })(TType)
      );
      exports.TEnumLiteral = TEnumLiteral;
      function makeIfaceProps(props) {
        return Object.keys(props).map(function(name2) {
          return makeIfaceProp(name2, props[name2]);
        });
      }
      function makeIfaceProp(name2, prop) {
        return prop instanceof TOptional ? new TProp(name2, prop.ttype, true) : new TProp(name2, parseSpec(prop), false);
      }
      function iface2(bases, props) {
        return new TIface(bases, makeIfaceProps(props));
      }
      exports.iface = iface2;
      var TIface = (
        /** @class */
        (function(_super) {
          __extends(TIface2, _super);
          function TIface2(bases, props) {
            var _this = _super.call(this) || this;
            _this.bases = bases;
            _this.props = props;
            _this.propSet = new Set(props.map(function(p) {
              return p.name;
            }));
            return _this;
          }
          TIface2.prototype.getChecker = function(suite, strict, allowedProps) {
            var _this = this;
            var baseCheckers = this.bases.map(function(b) {
              return getNamedType(suite, b).getChecker(suite, strict);
            });
            var propCheckers = this.props.map(function(prop) {
              return prop.ttype.getChecker(suite, strict);
            });
            var testCtx = new util_1.NoopContext();
            var isPropRequired = this.props.map(function(prop, i) {
              return !prop.isOpt && !propCheckers[i](void 0, testCtx);
            });
            var checker = function(value, ctx) {
              if (typeof value !== "object" || value === null) {
                return ctx.fail(null, "is not an object", 0);
              }
              for (var i = 0; i < baseCheckers.length; i++) {
                if (!baseCheckers[i](value, ctx)) {
                  return false;
                }
              }
              for (var i = 0; i < propCheckers.length; i++) {
                var name_1 = _this.props[i].name;
                var v = value[name_1];
                if (v === void 0) {
                  if (isPropRequired[i]) {
                    return ctx.fail(name_1, "is missing", 1);
                  }
                } else {
                  var ok = propCheckers[i](v, ctx);
                  if (!ok) {
                    return ctx.fail(name_1, null, 1);
                  }
                }
              }
              return true;
            };
            if (!strict) {
              return checker;
            }
            var propSet = this.propSet;
            if (allowedProps) {
              this.propSet.forEach(function(prop) {
                return allowedProps.add(prop);
              });
              propSet = allowedProps;
            }
            return function(value, ctx) {
              if (!checker(value, ctx)) {
                return false;
              }
              for (var prop in value) {
                if (!propSet.has(prop)) {
                  return ctx.fail(prop, "is extraneous", 2);
                }
              }
              return true;
            };
          };
          return TIface2;
        })(TType)
      );
      exports.TIface = TIface;
      function opt2(typeSpec) {
        return new TOptional(parseSpec(typeSpec));
      }
      exports.opt = opt2;
      var TOptional = (
        /** @class */
        (function(_super) {
          __extends(TOptional2, _super);
          function TOptional2(ttype) {
            var _this = _super.call(this) || this;
            _this.ttype = ttype;
            return _this;
          }
          TOptional2.prototype.getChecker = function(suite, strict) {
            var itemChecker = this.ttype.getChecker(suite, strict);
            return function(value, ctx) {
              return value === void 0 || itemChecker(value, ctx);
            };
          };
          return TOptional2;
        })(TType)
      );
      exports.TOptional = TOptional;
      var TProp = (
        /** @class */
        /* @__PURE__ */ (function() {
          function TProp2(name2, ttype, isOpt) {
            this.name = name2;
            this.ttype = ttype;
            this.isOpt = isOpt;
          }
          return TProp2;
        })()
      );
      exports.TProp = TProp;
      function func(resultSpec) {
        var params = [];
        for (var _i2 = 1; _i2 < arguments.length; _i2++) {
          params[_i2 - 1] = arguments[_i2];
        }
        return new TFunc(new TParamList(params), parseSpec(resultSpec));
      }
      exports.func = func;
      var TFunc = (
        /** @class */
        (function(_super) {
          __extends(TFunc2, _super);
          function TFunc2(paramList, result) {
            var _this = _super.call(this) || this;
            _this.paramList = paramList;
            _this.result = result;
            return _this;
          }
          TFunc2.prototype.getChecker = function(suite, strict) {
            return function(value, ctx) {
              return typeof value === "function" ? true : ctx.fail(null, "is not a function", 0);
            };
          };
          return TFunc2;
        })(TType)
      );
      exports.TFunc = TFunc;
      function param(name2, typeSpec, isOpt) {
        return new TParam(name2, parseSpec(typeSpec), Boolean(isOpt));
      }
      exports.param = param;
      var TParam = (
        /** @class */
        /* @__PURE__ */ (function() {
          function TParam2(name2, ttype, isOpt) {
            this.name = name2;
            this.ttype = ttype;
            this.isOpt = isOpt;
          }
          return TParam2;
        })()
      );
      exports.TParam = TParam;
      var TParamList = (
        /** @class */
        (function(_super) {
          __extends(TParamList2, _super);
          function TParamList2(params) {
            var _this = _super.call(this) || this;
            _this.params = params;
            return _this;
          }
          TParamList2.prototype.getChecker = function(suite, strict) {
            var _this = this;
            var itemCheckers = this.params.map(function(t2) {
              return t2.ttype.getChecker(suite, strict);
            });
            var testCtx = new util_1.NoopContext();
            var isParamRequired = this.params.map(function(param2, i) {
              return !param2.isOpt && !itemCheckers[i](void 0, testCtx);
            });
            var checker = function(value, ctx) {
              if (!Array.isArray(value)) {
                return ctx.fail(null, "is not an array", 0);
              }
              for (var i = 0; i < itemCheckers.length; i++) {
                var p = _this.params[i];
                if (value[i] === void 0) {
                  if (isParamRequired[i]) {
                    return ctx.fail(p.name, "is missing", 1);
                  }
                } else {
                  var ok = itemCheckers[i](value[i], ctx);
                  if (!ok) {
                    return ctx.fail(p.name, null, 1);
                  }
                }
              }
              return true;
            };
            if (!strict) {
              return checker;
            }
            return function(value, ctx) {
              if (!checker(value, ctx)) {
                return false;
              }
              return value.length <= itemCheckers.length ? true : ctx.fail(itemCheckers.length, "is extraneous", 2);
            };
          };
          return TParamList2;
        })(TType)
      );
      exports.TParamList = TParamList;
      var BasicType = (
        /** @class */
        (function(_super) {
          __extends(BasicType2, _super);
          function BasicType2(validator, message) {
            var _this = _super.call(this) || this;
            _this.validator = validator;
            _this.message = message;
            return _this;
          }
          BasicType2.prototype.getChecker = function(suite, strict) {
            var _this = this;
            return function(value, ctx) {
              return _this.validator(value) ? true : ctx.fail(null, _this.message, 0);
            };
          };
          return BasicType2;
        })(TType)
      );
      exports.BasicType = BasicType;
      exports.basicTypes = {
        any: new BasicType(function(v) {
          return true;
        }, "is invalid"),
        number: new BasicType(function(v) {
          return typeof v === "number";
        }, "is not a number"),
        object: new BasicType(function(v) {
          return typeof v === "object" && v;
        }, "is not an object"),
        boolean: new BasicType(function(v) {
          return typeof v === "boolean";
        }, "is not a boolean"),
        string: new BasicType(function(v) {
          return typeof v === "string";
        }, "is not a string"),
        symbol: new BasicType(function(v) {
          return typeof v === "symbol";
        }, "is not a symbol"),
        void: new BasicType(function(v) {
          return v == null;
        }, "is not void"),
        undefined: new BasicType(function(v) {
          return v === void 0;
        }, "is not undefined"),
        null: new BasicType(function(v) {
          return v === null;
        }, "is not null"),
        never: new BasicType(function(v) {
          return false;
        }, "is unexpected"),
        Date: new BasicType(getIsNativeChecker("[object Date]"), "is not a Date"),
        RegExp: new BasicType(getIsNativeChecker("[object RegExp]"), "is not a RegExp")
      };
      var nativeToString = Object.prototype.toString;
      function getIsNativeChecker(tag) {
        return function(v) {
          return typeof v === "object" && v && nativeToString.call(v) === tag;
        };
      }
      if (typeof Buffer !== "undefined") {
        exports.basicTypes.Buffer = new BasicType(function(v) {
          return Buffer.isBuffer(v);
        }, "is not a Buffer");
      }
      var _loop_1 = function(array_12) {
        exports.basicTypes[array_12.name] = new BasicType(function(v) {
          return v instanceof array_12;
        }, "is not a " + array_12.name);
      };
      for (_i = 0, _a = [
        Int8Array,
        Uint8Array,
        Uint8ClampedArray,
        Int16Array,
        Uint16Array,
        Int32Array,
        Uint32Array,
        Float32Array,
        Float64Array,
        ArrayBuffer
      ]; _i < _a.length; _i++) {
        array_1 = _a[_i];
        _loop_1(array_1);
      }
      var array_1;
      var _i;
      var _a;
    }
  });

  // node_modules/ts-interface-checker/dist/index.js
  var require_dist = __commonJS({
    "node_modules/ts-interface-checker/dist/index.js"(exports) {
      "use strict";
      var __spreadArrays = exports && exports.__spreadArrays || function() {
        for (var s = 0, i = 0, il = arguments.length; i < il; i++) s += arguments[i].length;
        for (var r = Array(s), k = 0, i = 0; i < il; i++)
          for (var a = arguments[i], j = 0, jl = a.length; j < jl; j++, k++)
            r[k] = a[j];
        return r;
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.Checker = exports.createCheckers = void 0;
      var types_1 = require_types();
      var util_1 = require_util();
      var types_2 = require_types();
      Object.defineProperty(exports, "TArray", { enumerable: true, get: function() {
        return types_2.TArray;
      } });
      Object.defineProperty(exports, "TEnumType", { enumerable: true, get: function() {
        return types_2.TEnumType;
      } });
      Object.defineProperty(exports, "TEnumLiteral", { enumerable: true, get: function() {
        return types_2.TEnumLiteral;
      } });
      Object.defineProperty(exports, "TFunc", { enumerable: true, get: function() {
        return types_2.TFunc;
      } });
      Object.defineProperty(exports, "TIface", { enumerable: true, get: function() {
        return types_2.TIface;
      } });
      Object.defineProperty(exports, "TLiteral", { enumerable: true, get: function() {
        return types_2.TLiteral;
      } });
      Object.defineProperty(exports, "TName", { enumerable: true, get: function() {
        return types_2.TName;
      } });
      Object.defineProperty(exports, "TOptional", { enumerable: true, get: function() {
        return types_2.TOptional;
      } });
      Object.defineProperty(exports, "TParam", { enumerable: true, get: function() {
        return types_2.TParam;
      } });
      Object.defineProperty(exports, "TParamList", { enumerable: true, get: function() {
        return types_2.TParamList;
      } });
      Object.defineProperty(exports, "TProp", { enumerable: true, get: function() {
        return types_2.TProp;
      } });
      Object.defineProperty(exports, "TTuple", { enumerable: true, get: function() {
        return types_2.TTuple;
      } });
      Object.defineProperty(exports, "TType", { enumerable: true, get: function() {
        return types_2.TType;
      } });
      Object.defineProperty(exports, "TUnion", { enumerable: true, get: function() {
        return types_2.TUnion;
      } });
      Object.defineProperty(exports, "TIntersection", { enumerable: true, get: function() {
        return types_2.TIntersection;
      } });
      Object.defineProperty(exports, "array", { enumerable: true, get: function() {
        return types_2.array;
      } });
      Object.defineProperty(exports, "enumlit", { enumerable: true, get: function() {
        return types_2.enumlit;
      } });
      Object.defineProperty(exports, "enumtype", { enumerable: true, get: function() {
        return types_2.enumtype;
      } });
      Object.defineProperty(exports, "func", { enumerable: true, get: function() {
        return types_2.func;
      } });
      Object.defineProperty(exports, "iface", { enumerable: true, get: function() {
        return types_2.iface;
      } });
      Object.defineProperty(exports, "lit", { enumerable: true, get: function() {
        return types_2.lit;
      } });
      Object.defineProperty(exports, "name", { enumerable: true, get: function() {
        return types_2.name;
      } });
      Object.defineProperty(exports, "opt", { enumerable: true, get: function() {
        return types_2.opt;
      } });
      Object.defineProperty(exports, "param", { enumerable: true, get: function() {
        return types_2.param;
      } });
      Object.defineProperty(exports, "tuple", { enumerable: true, get: function() {
        return types_2.tuple;
      } });
      Object.defineProperty(exports, "union", { enumerable: true, get: function() {
        return types_2.union;
      } });
      Object.defineProperty(exports, "intersection", { enumerable: true, get: function() {
        return types_2.intersection;
      } });
      Object.defineProperty(exports, "BasicType", { enumerable: true, get: function() {
        return types_2.BasicType;
      } });
      var util_2 = require_util();
      Object.defineProperty(exports, "VError", { enumerable: true, get: function() {
        return util_2.VError;
      } });
      function createCheckers2() {
        var typeSuite = [];
        for (var _i = 0; _i < arguments.length; _i++) {
          typeSuite[_i] = arguments[_i];
        }
        var fullSuite = Object.assign.apply(Object, __spreadArrays([{}, types_1.basicTypes], typeSuite));
        var checkers = {};
        for (var _a = 0, typeSuite_1 = typeSuite; _a < typeSuite_1.length; _a++) {
          var suite_1 = typeSuite_1[_a];
          for (var _b = 0, _c = Object.keys(suite_1); _b < _c.length; _b++) {
            var name = _c[_b];
            checkers[name] = new Checker(fullSuite, suite_1[name]);
          }
        }
        return checkers;
      }
      exports.createCheckers = createCheckers2;
      var Checker = (
        /** @class */
        (function() {
          function Checker2(suite, ttype, _path) {
            if (_path === void 0) {
              _path = "value";
            }
            this.suite = suite;
            this.ttype = ttype;
            this._path = _path;
            this.props = /* @__PURE__ */ new Map();
            if (ttype instanceof types_1.TIface) {
              for (var _i = 0, _a = ttype.props; _i < _a.length; _i++) {
                var p = _a[_i];
                this.props.set(p.name, p.ttype);
              }
            }
            this.checkerPlain = this.ttype.getChecker(suite, false);
            this.checkerStrict = this.ttype.getChecker(suite, true);
          }
          Checker2.prototype.setReportedPath = function(path) {
            this._path = path;
          };
          Checker2.prototype.check = function(value) {
            return this._doCheck(this.checkerPlain, value);
          };
          Checker2.prototype.test = function(value) {
            return this.checkerPlain(value, new util_1.NoopContext());
          };
          Checker2.prototype.validate = function(value) {
            return this._doValidate(this.checkerPlain, value);
          };
          Checker2.prototype.strictCheck = function(value) {
            return this._doCheck(this.checkerStrict, value);
          };
          Checker2.prototype.strictTest = function(value) {
            return this.checkerStrict(value, new util_1.NoopContext());
          };
          Checker2.prototype.strictValidate = function(value) {
            return this._doValidate(this.checkerStrict, value);
          };
          Checker2.prototype.getProp = function(prop) {
            var ttype = this.props.get(prop);
            if (!ttype) {
              throw new Error("Type has no property " + prop);
            }
            return new Checker2(this.suite, ttype, this._path + "." + prop);
          };
          Checker2.prototype.methodArgs = function(methodName) {
            var tfunc = this._getMethod(methodName);
            return new Checker2(this.suite, tfunc.paramList);
          };
          Checker2.prototype.methodResult = function(methodName) {
            var tfunc = this._getMethod(methodName);
            return new Checker2(this.suite, tfunc.result);
          };
          Checker2.prototype.getArgs = function() {
            if (!(this.ttype instanceof types_1.TFunc)) {
              throw new Error("getArgs() applied to non-function");
            }
            return new Checker2(this.suite, this.ttype.paramList);
          };
          Checker2.prototype.getResult = function() {
            if (!(this.ttype instanceof types_1.TFunc)) {
              throw new Error("getResult() applied to non-function");
            }
            return new Checker2(this.suite, this.ttype.result);
          };
          Checker2.prototype.getType = function() {
            return this.ttype;
          };
          Checker2.prototype._doCheck = function(checkerFunc, value) {
            var noopCtx = new util_1.NoopContext();
            if (!checkerFunc(value, noopCtx)) {
              var detailCtx = new util_1.DetailContext();
              checkerFunc(value, detailCtx);
              throw detailCtx.getError(this._path);
            }
          };
          Checker2.prototype._doValidate = function(checkerFunc, value) {
            var noopCtx = new util_1.NoopContext();
            if (checkerFunc(value, noopCtx)) {
              return null;
            }
            var detailCtx = new util_1.DetailContext();
            checkerFunc(value, detailCtx);
            return detailCtx.getErrorDetail(this._path);
          };
          Checker2.prototype._getMethod = function(methodName) {
            var ttype = this.props.get(methodName);
            if (!ttype) {
              throw new Error("Type has no property " + methodName);
            }
            if (!(ttype instanceof types_1.TFunc)) {
              throw new Error("Property " + methodName + " is not a method");
            }
            return ttype;
          };
          return Checker2;
        })()
      );
      exports.Checker = Checker;
    }
  });

  // node_modules/lines-and-columns/build/index.js
  var require_build = __commonJS({
    "node_modules/lines-and-columns/build/index.js"(exports) {
      "use strict";
      exports.__esModule = true;
      exports.LinesAndColumns = void 0;
      var LF = "\n";
      var CR = "\r";
      var LinesAndColumns2 = (
        /** @class */
        (function() {
          function LinesAndColumns3(string) {
            this.string = string;
            var offsets = [0];
            for (var offset2 = 0; offset2 < string.length; ) {
              switch (string[offset2]) {
                case LF:
                  offset2 += LF.length;
                  offsets.push(offset2);
                  break;
                case CR:
                  offset2 += CR.length;
                  if (string[offset2] === LF) {
                    offset2 += LF.length;
                  }
                  offsets.push(offset2);
                  break;
                default:
                  offset2++;
                  break;
              }
            }
            this.offsets = offsets;
          }
          LinesAndColumns3.prototype.locationForIndex = function(index) {
            if (index < 0 || index > this.string.length) {
              return null;
            }
            var line = 0;
            var offsets = this.offsets;
            while (offsets[line + 1] <= index) {
              line++;
            }
            var column = index - offsets[line];
            return { line, column };
          };
          LinesAndColumns3.prototype.indexForLocation = function(location) {
            var line = location.line, column = location.column;
            if (line < 0 || line >= this.offsets.length) {
              return null;
            }
            if (column < 0 || column > this.lengthOfLine(line)) {
              return null;
            }
            return this.offsets[line] + column;
          };
          LinesAndColumns3.prototype.lengthOfLine = function(line) {
            var offset2 = this.offsets[line];
            var nextOffset = line === this.offsets.length - 1 ? this.string.length : this.offsets[line + 1];
            return nextOffset - offset2;
          };
          return LinesAndColumns3;
        })()
      );
      exports.LinesAndColumns = LinesAndColumns2;
      exports["default"] = LinesAndColumns2;
    }
  });

  // node_modules/acorn/dist/acorn.mjs
  var astralIdentifierCodes = [509, 0, 227, 0, 150, 4, 294, 9, 1368, 2, 2, 1, 6, 3, 41, 2, 5, 0, 166, 1, 574, 3, 9, 9, 7, 9, 32, 4, 318, 1, 31, 4, 33, 15, 71, 10, 50, 3, 123, 2, 54, 14, 32, 10, 3, 1, 11, 3, 46, 10, 8, 0, 46, 9, 7, 2, 37, 13, 2, 9, 6, 1, 45, 0, 13, 2, 49, 13, 9, 3, 2, 11, 83, 11, 7, 0, 3, 0, 158, 11, 6, 9, 7, 3, 56, 1, 2, 6, 3, 1, 3, 2, 10, 0, 11, 1, 3, 6, 4, 4, 68, 8, 2, 0, 3, 0, 2, 3, 2, 4, 2, 0, 15, 1, 83, 17, 10, 9, 5, 0, 82, 19, 13, 9, 214, 6, 3, 8, 28, 1, 83, 16, 16, 9, 82, 12, 9, 9, 7, 19, 58, 14, 5, 9, 243, 14, 166, 9, 71, 5, 2, 1, 3, 3, 2, 0, 2, 1, 13, 9, 120, 6, 3, 6, 4, 0, 29, 9, 41, 6, 2, 3, 9, 0, 10, 10, 47, 15, 199, 7, 137, 9, 54, 7, 2, 7, 17, 9, 57, 21, 2, 13, 123, 5, 4, 0, 2, 1, 2, 6, 2, 0, 9, 9, 49, 4, 2, 1, 2, 4, 9, 9, 55, 9, 7, 0, 259, 3, 10, 1, 2, 0, 49, 6, 4, 4, 14, 10, 5350, 0, 7, 14, 11465, 27, 2343, 9, 87, 9, 39, 4, 60, 6, 26, 9, 535, 9, 470, 0, 2, 54, 8, 3, 82, 0, 12, 1, 19628, 1, 4178, 9, 519, 45, 3, 22, 481, 1, 61, 4, 4, 5, 9, 7, 3, 6, 31, 3, 149, 2, 12, 2, 9, 1, 3, 0, 33, 1, 1357, 49, 513, 54, 5, 49, 9, 0, 15, 0, 23, 4, 2, 14, 1361, 6, 2, 16, 3, 6, 2, 1, 2, 4, 101, 0, 161, 6, 10, 9, 357, 0, 62, 13, 499, 13, 245, 1, 2, 9, 233, 0, 3, 0, 8, 1, 6, 0, 475, 6, 110, 6, 6, 9, 4759, 9, 787719, 239];
  var astralIdentifierStartCodes = [0, 11, 2, 25, 2, 18, 2, 1, 2, 14, 3, 13, 35, 122, 70, 52, 268, 28, 4, 48, 48, 31, 14, 29, 6, 37, 11, 29, 3, 35, 5, 7, 2, 4, 43, 157, 19, 35, 5, 35, 5, 39, 9, 51, 13, 10, 2, 14, 2, 6, 2, 1, 2, 10, 2, 14, 2, 6, 2, 1, 4, 51, 13, 310, 10, 21, 11, 7, 25, 5, 2, 41, 2, 13, 65, 5, 3, 0, 2, 43, 2, 1, 4, 0, 3, 22, 11, 22, 10, 30, 66, 18, 2, 1, 11, 21, 11, 25, 7, 25, 39, 55, 7, 1, 65, 0, 16, 3, 2, 2, 2, 28, 43, 28, 4, 28, 36, 7, 2, 27, 28, 53, 11, 21, 11, 18, 14, 17, 111, 72, 56, 50, 14, 50, 14, 35, 39, 27, 10, 22, 251, 41, 7, 1, 17, 5, 18, 21, 18, 28, 11, 0, 9, 21, 43, 17, 47, 20, 28, 22, 13, 52, 58, 1, 3, 0, 14, 44, 33, 24, 27, 35, 30, 0, 3, 0, 9, 34, 4, 0, 13, 47, 15, 3, 22, 0, 2, 0, 36, 17, 2, 24, 20, 1, 64, 6, 2, 0, 2, 3, 2, 14, 2, 9, 8, 46, 39, 7, 3, 1, 3, 21, 2, 6, 2, 1, 2, 4, 4, 0, 19, 0, 13, 4, 31, 9, 2, 0, 3, 0, 2, 37, 2, 0, 26, 0, 2, 0, 45, 52, 19, 3, 21, 2, 31, 47, 21, 1, 2, 0, 185, 46, 42, 3, 37, 47, 21, 0, 60, 42, 14, 0, 72, 26, 38, 6, 186, 43, 117, 63, 32, 7, 3, 0, 3, 7, 2, 1, 2, 23, 16, 0, 2, 0, 95, 7, 3, 38, 17, 0, 2, 0, 29, 0, 11, 39, 8, 0, 22, 0, 12, 45, 20, 0, 19, 72, 18, 0, 182, 32, 32, 8, 2, 36, 18, 0, 50, 29, 113, 6, 2, 1, 2, 37, 22, 0, 26, 5, 2, 1, 2, 31, 15, 0, 24, 43, 22, 0, 239, 18, 16, 0, 2, 12, 2, 33, 125, 0, 80, 921, 103, 111, 6, 206, 13, 310, 2314, 96, 16, 1071, 18, 5, 26, 3994, 6, 582, 6842, 29, 1763, 568, 8, 30, 18, 78, 18, 29, 19, 47, 17, 3, 32, 20, 6, 18, 433, 44, 212, 63, 33, 24, 3, 24, 45, 74, 6, 0, 67, 12, 65, 1, 2, 0, 15, 4, 10, 7386, 37, 33, 96, 114, 14, 913, 15, 50, 7710, 3, 2, 6, 2, 1, 2, 296, 10, 0, 30, 2, 3, 0, 15, 4, 8, 395, 2309, 106, 6, 12, 4, 8, 8, 9, 5991, 84, 2, 70, 2, 1, 3, 0, 3, 1, 3, 3, 2, 11, 2, 0, 2, 6, 2, 64, 2, 3, 3, 7, 2, 6, 2, 27, 2, 3, 2, 4, 2, 0, 4, 6, 2, 340, 2, 24, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 30, 2, 24, 2, 7, 1845, 129, 15, 6, 55, 50, 49, 61, 147, 44, 11, 6, 17, 0, 322, 29, 19, 43, 485, 27, 229, 29, 3, 0, 208, 30, 2, 2, 2, 1, 2, 6, 3, 4, 10, 1, 225, 6, 2, 3, 2, 1, 2, 14, 2, 196, 60, 67, 8, 0, 1205, 3, 2, 26, 2, 1, 2, 0, 3, 0, 2, 9, 2, 3, 2, 0, 2, 0, 7, 0, 5, 0, 2, 0, 2, 0, 2, 2, 2, 1, 2, 0, 3, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 1, 2, 0, 3, 3, 2, 6, 2, 3, 2, 3, 2, 0, 2, 9, 2, 16, 6, 2, 2, 4, 2, 16, 4421, 42719, 33, 4382, 2, 5773, 3, 7472, 16, 621, 2467, 541, 1507, 4938, 6, 8489, 39815, 11327];
  var nonASCIIidentifierChars = "\u200C\u200D\xB7\u0300-\u036F\u0387\u0483-\u0487\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7-\u05C9\u0610-\u061A\u064B-\u0669\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED\u06F0-\u06F9\u0711\u0730-\u074A\u07A6-\u07B0\u07C0-\u07C9\u07EB-\u07F3\u07FD\u0816-\u0819\u081B-\u0823\u0825-\u0827\u0829-\u082D\u0859-\u085B\u0897-\u089F\u08CA-\u08E1\u08E3-\u0903\u093A-\u093C\u093E-\u094F\u0951-\u0957\u0962\u0963\u0966-\u096F\u0981-\u0983\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB-\u09CD\u09D7\u09E2\u09E3\u09E6-\u09EF\u09FE\u0A01-\u0A03\u0A3C\u0A3E-\u0A42\u0A47\u0A48\u0A4B-\u0A4D\u0A51\u0A66-\u0A71\u0A75\u0A81-\u0A83\u0ABC\u0ABE-\u0AC5\u0AC7-\u0AC9\u0ACB-\u0ACD\u0AE2\u0AE3\u0AE6-\u0AEF\u0AFA-\u0AFF\u0B01-\u0B03\u0B3C\u0B3E-\u0B44\u0B47\u0B48\u0B4B-\u0B4D\u0B53-\u0B57\u0B62\u0B63\u0B66-\u0B6F\u0B82\u0BBE-\u0BC2\u0BC6-\u0BC8\u0BCA-\u0BCD\u0BD7\u0BE6-\u0BEF\u0C00-\u0C04\u0C3C\u0C3E-\u0C44\u0C46-\u0C48\u0C4A-\u0C4D\u0C55\u0C56\u0C62\u0C63\u0C66-\u0C6F\u0C81-\u0C83\u0CBC\u0CBE-\u0CC4\u0CC6-\u0CC8\u0CCA-\u0CCD\u0CD5\u0CD6\u0CE2\u0CE3\u0CE6-\u0CEF\u0CF3\u0D00-\u0D03\u0D3B\u0D3C\u0D3E-\u0D44\u0D46-\u0D48\u0D4A-\u0D4D\u0D57\u0D62\u0D63\u0D66-\u0D6F\u0D81-\u0D83\u0DCA\u0DCF-\u0DD4\u0DD6\u0DD8-\u0DDF\u0DE6-\u0DEF\u0DF2\u0DF3\u0E31\u0E34-\u0E3A\u0E47-\u0E4E\u0E50-\u0E59\u0EB1\u0EB4-\u0EBC\u0EC8-\u0ECE\u0ED0-\u0ED9\u0F18\u0F19\u0F20-\u0F29\u0F35\u0F37\u0F39\u0F3E\u0F3F\u0F71-\u0F84\u0F86\u0F87\u0F8D-\u0F97\u0F99-\u0FBC\u0FC6\u102B-\u103E\u1040-\u1049\u1056-\u1059\u105E-\u1060\u1062-\u1064\u1067-\u106D\u1071-\u1074\u1082-\u108D\u108F-\u109D\u135D-\u135F\u1369-\u1371\u1712-\u1715\u1732-\u1734\u1752\u1753\u1772\u1773\u17B4-\u17D3\u17DD\u17E0-\u17E9\u180B-\u180D\u180F-\u1819\u18A9\u1920-\u192B\u1930-\u193B\u1946-\u194F\u19D0-\u19DA\u1A17-\u1A1B\u1A55-\u1A5E\u1A60-\u1A7C\u1A7F-\u1A89\u1A90-\u1A99\u1AB0-\u1ABD\u1ABF-\u1AF0\u1B00-\u1B04\u1B34-\u1B44\u1B50-\u1B59\u1B6B-\u1B73\u1B80-\u1B82\u1BA1-\u1BAD\u1BB0-\u1BB9\u1BE6-\u1BF3\u1C24-\u1C37\u1C40-\u1C49\u1C50-\u1C59\u1CD0-\u1CD2\u1CD4-\u1CE8\u1CED\u1CF4\u1CF7-\u1CF9\u1DC0-\u1DFF\u200C\u200D\u203F\u2040\u2054\u20D0-\u20DC\u20E1\u20E5-\u20F0\u2CEF-\u2CF1\u2D7F\u2DE0-\u2DFF\u302A-\u302F\u3099\u309A\u30FB\uA620-\uA629\uA66F\uA674-\uA67D\uA69E\uA69F\uA6F0\uA6F1\uA802\uA806\uA80B\uA823-\uA827\uA82C\uA880\uA881\uA8B4-\uA8C5\uA8D0-\uA8D9\uA8E0-\uA8F1\uA8FF-\uA909\uA926-\uA92D\uA947-\uA953\uA980-\uA983\uA9B3-\uA9C0\uA9D0-\uA9D9\uA9E5\uA9F0-\uA9F9\uAA29-\uAA36\uAA43\uAA4C\uAA4D\uAA50-\uAA59\uAA7B-\uAA7D\uAAB0\uAAB2-\uAAB4\uAAB7\uAAB8\uAABE\uAABF\uAAC1\uAAEB-\uAAEF\uAAF5\uAAF6\uABE3-\uABEA\uABEC\uABED\uABF0-\uABF9\uFB1E\uFE00-\uFE0F\uFE20-\uFE2F\uFE33\uFE34\uFE4D-\uFE4F\uFF10-\uFF19\uFF3F\uFF65";
  var nonASCIIidentifierStartChars = "\xAA\xB5\xBA\xC0-\xD6\xD8-\xF6\xF8-\u02C1\u02C6-\u02D1\u02E0-\u02E4\u02EC\u02EE\u0370-\u0374\u0376\u0377\u037A-\u037D\u037F\u0386\u0388-\u038A\u038C\u038E-\u03A1\u03A3-\u03F5\u03F7-\u0481\u048A-\u052F\u0531-\u0556\u0558\u0559\u0560-\u0588\u058B\u058C\u05D0-\u05EA\u05EF-\u05F2\u0620-\u064A\u066E\u066F\u0671-\u06D3\u06D5\u06E5\u06E6\u06EE\u06EF\u06FA-\u06FC\u06FF\u0710\u0712-\u072F\u074D-\u07A5\u07B1\u07CA-\u07EA\u07F4\u07F5\u07FA\u0800-\u0815\u081A\u0824\u0828\u0840-\u0858\u0860-\u086A\u0870-\u0887\u0889-\u088F\u08A0-\u08C9\u0904-\u0939\u093D\u0950\u0958-\u0961\u0971-\u0980\u0985-\u098C\u098F\u0990\u0993-\u09A8\u09AA-\u09B0\u09B2\u09B6-\u09B9\u09BD\u09CE\u09DC\u09DD\u09DF-\u09E1\u09F0\u09F1\u09FC\u0A05-\u0A0A\u0A0F\u0A10\u0A13-\u0A28\u0A2A-\u0A30\u0A32\u0A33\u0A35\u0A36\u0A38\u0A39\u0A59-\u0A5C\u0A5E\u0A72-\u0A74\u0A85-\u0A8D\u0A8F-\u0A91\u0A93-\u0AA8\u0AAA-\u0AB0\u0AB2\u0AB3\u0AB5-\u0AB9\u0ABD\u0AD0\u0AE0\u0AE1\u0AF9\u0B05-\u0B0C\u0B0F\u0B10\u0B13-\u0B28\u0B2A-\u0B30\u0B32\u0B33\u0B35-\u0B39\u0B3D\u0B5C\u0B5D\u0B5F-\u0B61\u0B71\u0B83\u0B85-\u0B8A\u0B8E-\u0B90\u0B92-\u0B95\u0B99\u0B9A\u0B9C\u0B9E\u0B9F\u0BA3\u0BA4\u0BA8-\u0BAA\u0BAE-\u0BB9\u0BD0\u0C05-\u0C0C\u0C0E-\u0C10\u0C12-\u0C28\u0C2A-\u0C39\u0C3D\u0C58-\u0C5A\u0C5C\u0C5D\u0C60\u0C61\u0C80\u0C85-\u0C8C\u0C8E-\u0C90\u0C92-\u0CA8\u0CAA-\u0CB3\u0CB5-\u0CB9\u0CBD\u0CDC-\u0CDE\u0CE0\u0CE1\u0CF1\u0CF2\u0D04-\u0D0C\u0D0E-\u0D10\u0D12-\u0D3A\u0D3D\u0D4E\u0D54-\u0D56\u0D5F-\u0D61\u0D7A-\u0D7F\u0D85-\u0D96\u0D9A-\u0DB1\u0DB3-\u0DBB\u0DBD\u0DC0-\u0DC6\u0E01-\u0E30\u0E32\u0E33\u0E40-\u0E46\u0E81\u0E82\u0E84\u0E86-\u0E8A\u0E8C-\u0EA3\u0EA5\u0EA7-\u0EB0\u0EB2\u0EB3\u0EBD\u0EC0-\u0EC4\u0EC6\u0EDC-\u0EDF\u0F00\u0F40-\u0F47\u0F49-\u0F6C\u0F88-\u0F8C\u1000-\u102A\u103F\u1050-\u1055\u105A-\u105D\u1061\u1065\u1066\u106E-\u1070\u1075-\u1081\u108E\u10A0-\u10C5\u10C7\u10CD\u10D0-\u10FA\u10FC-\u1248\u124A-\u124D\u1250-\u1256\u1258\u125A-\u125D\u1260-\u1288\u128A-\u128D\u1290-\u12B0\u12B2-\u12B5\u12B8-\u12BE\u12C0\u12C2-\u12C5\u12C8-\u12D6\u12D8-\u1310\u1312-\u1315\u1318-\u135A\u1380-\u138F\u13A0-\u13F5\u13F8-\u13FD\u1401-\u166C\u166F-\u167F\u1681-\u169A\u16A0-\u16EA\u16EE-\u16F8\u1700-\u1711\u171F-\u1731\u1740-\u1751\u1760-\u176C\u176E-\u1770\u1780-\u17B3\u17D7\u17DC\u1820-\u1878\u1880-\u18A8\u18AA\u18B0-\u18F5\u1900-\u191E\u1950-\u196D\u1970-\u1974\u1980-\u19AB\u19B0-\u19C9\u1A00-\u1A16\u1A20-\u1A54\u1AA7\u1B05-\u1B33\u1B45-\u1B4C\u1B83-\u1BA0\u1BAE\u1BAF\u1BBA-\u1BE5\u1C00-\u1C23\u1C4D-\u1C4F\u1C5A-\u1C7D\u1C80-\u1C8A\u1C90-\u1CBA\u1CBD-\u1CBF\u1CE9-\u1CEC\u1CEE-\u1CF3\u1CF5\u1CF6\u1CFA\u1D00-\u1DBF\u1E00-\u1F15\u1F18-\u1F1D\u1F20-\u1F45\u1F48-\u1F4D\u1F50-\u1F57\u1F59\u1F5B\u1F5D\u1F5F-\u1F7D\u1F80-\u1FB4\u1FB6-\u1FBC\u1FBE\u1FC2-\u1FC4\u1FC6-\u1FCC\u1FD0-\u1FD3\u1FD6-\u1FDB\u1FE0-\u1FEC\u1FF2-\u1FF4\u1FF6-\u1FFC\u2071\u207F\u208F-\u209F\u2102\u2107\u210A-\u2113\u2115\u2118-\u211D\u2124\u2126\u2128\u212A-\u2139\u213C-\u213F\u2145-\u2149\u214E\u2160-\u2188\u2C00-\u2CE4\u2CEB-\u2CEE\u2CF2\u2CF3\u2D00-\u2D25\u2D27\u2D2D\u2D30-\u2D67\u2D6F\u2D80-\u2D96\u2DA0-\u2DA6\u2DA8-\u2DAE\u2DB0-\u2DB6\u2DB8-\u2DBE\u2DC0-\u2DC6\u2DC8-\u2DCE\u2DD0-\u2DD6\u2DD8-\u2DDE\u3005-\u3007\u3021-\u3029\u3031-\u3035\u3038-\u303C\u3041-\u3096\u309B-\u309F\u30A1-\u30FA\u30FC-\u30FF\u3105-\u312F\u3131-\u318E\u31A0-\u31BF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\uA48C\uA4D0-\uA4FD\uA500-\uA60C\uA610-\uA61F\uA62A\uA62B\uA640-\uA66E\uA67F-\uA69D\uA6A0-\uA6EF\uA717-\uA71F\uA722-\uA788\uA78B-\uA7DD\uA7E2\uA7F1-\uA801\uA803-\uA805\uA807-\uA80A\uA80C-\uA822\uA840-\uA873\uA882-\uA8B3\uA8F2-\uA8F7\uA8FB\uA8FD\uA8FE\uA90A-\uA925\uA930-\uA946\uA960-\uA97C\uA984-\uA9B2\uA9CF\uA9E0-\uA9E4\uA9E6-\uA9EF\uA9FA-\uA9FE\uAA00-\uAA28\uAA40-\uAA42\uAA44-\uAA4B\uAA60-\uAA76\uAA7A\uAA7E-\uAAAF\uAAB1\uAAB5\uAAB6\uAAB9-\uAABD\uAAC0\uAAC2\uAADB-\uAADD\uAAE0-\uAAEA\uAAF2-\uAAF4\uAB01-\uAB06\uAB09-\uAB0E\uAB11-\uAB16\uAB20-\uAB26\uAB28-\uAB2E\uAB30-\uAB5A\uAB5C-\uAB69\uAB6C\uAB6D\uAB70-\uABE2\uAC00-\uD7A3\uD7B0-\uD7C6\uD7CB-\uD7FB\uF900-\uFA6D\uFA70-\uFAD9\uFB00-\uFB06\uFB13-\uFB17\uFB1D\uFB1F-\uFB28\uFB2A-\uFB36\uFB38-\uFB3C\uFB3E\uFB40\uFB41\uFB43\uFB44\uFB46-\uFBB1\uFBD3-\uFD3D\uFD50-\uFD8F\uFD92-\uFDC7\uFDF0-\uFDFB\uFE70-\uFE74\uFE76-\uFEFC\uFF21-\uFF3A\uFF41-\uFF5A\uFF66-\uFFBE\uFFC2-\uFFC7\uFFCA-\uFFCF\uFFD2-\uFFD7\uFFDA-\uFFDC";
  var reservedWords = {
    3: "abstract boolean byte char class double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile",
    5: "class enum extends super const export import",
    6: "enum",
    strict: "implements interface let package private protected public static yield",
    strictBind: "eval arguments"
  };
  var ecma5AndLessKeywords = "break case catch continue debugger default do else finally for function if return switch throw try var while with null true false instanceof typeof void delete new in this";
  var keywords$1 = {
    5: ecma5AndLessKeywords,
    "5module": ecma5AndLessKeywords + " export import",
    6: ecma5AndLessKeywords + " const class extends export import super"
  };
  var keywordRelationalOperator = /^in(stanceof)?$/;
  var nonASCIIidentifierStart = new RegExp("[" + nonASCIIidentifierStartChars + "]");
  var nonASCIIidentifier = new RegExp("[" + nonASCIIidentifierStartChars + nonASCIIidentifierChars + "]");
  function isInAstralSet(code, set) {
    var pos = 65536;
    for (var i = 0; i < set.length; i += 2) {
      pos += set[i];
      if (pos > code) {
        return false;
      }
      pos += set[i + 1];
      if (pos >= code) {
        return true;
      }
    }
    return false;
  }
  function isIdentifierStart(code, astral) {
    if (code < 65) {
      return code === 36;
    }
    if (code < 91) {
      return true;
    }
    if (code < 97) {
      return code === 95;
    }
    if (code < 123) {
      return true;
    }
    if (code <= 65535) {
      return code >= 170 && nonASCIIidentifierStart.test(String.fromCharCode(code));
    }
    if (astral === false) {
      return false;
    }
    return isInAstralSet(code, astralIdentifierStartCodes);
  }
  function isIdentifierChar(code, astral) {
    if (code < 48) {
      return code === 36;
    }
    if (code < 58) {
      return true;
    }
    if (code < 65) {
      return false;
    }
    if (code < 91) {
      return true;
    }
    if (code < 97) {
      return code === 95;
    }
    if (code < 123) {
      return true;
    }
    if (code <= 65535) {
      return code >= 170 && nonASCIIidentifier.test(String.fromCharCode(code));
    }
    if (astral === false) {
      return false;
    }
    return isInAstralSet(code, astralIdentifierStartCodes) || isInAstralSet(code, astralIdentifierCodes);
  }
  var TokenType = function TokenType2(label, conf) {
    if (conf === void 0) conf = {};
    this.label = label;
    this.keyword = conf.keyword;
    this.beforeExpr = !!conf.beforeExpr;
    this.startsExpr = !!conf.startsExpr;
    this.isLoop = !!conf.isLoop;
    this.isAssign = !!conf.isAssign;
    this.prefix = !!conf.prefix;
    this.postfix = !!conf.postfix;
    this.binop = conf.binop || null;
    this.updateContext = null;
  };
  function binop(name, prec) {
    return new TokenType(name, { beforeExpr: true, binop: prec });
  }
  var beforeExpr = { beforeExpr: true };
  var startsExpr = { startsExpr: true };
  var keywords = {};
  function kw(name, options) {
    if (options === void 0) options = {};
    options.keyword = name;
    return keywords[name] = new TokenType(name, options);
  }
  var types$1 = {
    num: new TokenType("num", startsExpr),
    regexp: new TokenType("regexp", startsExpr),
    string: new TokenType("string", startsExpr),
    name: new TokenType("name", startsExpr),
    privateId: new TokenType("privateId", startsExpr),
    eof: new TokenType("eof"),
    // Punctuation token types.
    bracketL: new TokenType("[", { beforeExpr: true, startsExpr: true }),
    bracketR: new TokenType("]"),
    braceL: new TokenType("{", { beforeExpr: true, startsExpr: true }),
    braceR: new TokenType("}"),
    parenL: new TokenType("(", { beforeExpr: true, startsExpr: true }),
    parenR: new TokenType(")"),
    comma: new TokenType(",", beforeExpr),
    semi: new TokenType(";", beforeExpr),
    colon: new TokenType(":", beforeExpr),
    dot: new TokenType("."),
    question: new TokenType("?", beforeExpr),
    questionDot: new TokenType("?."),
    arrow: new TokenType("=>", beforeExpr),
    template: new TokenType("template"),
    invalidTemplate: new TokenType("invalidTemplate"),
    ellipsis: new TokenType("...", beforeExpr),
    backQuote: new TokenType("`", startsExpr),
    dollarBraceL: new TokenType("${", { beforeExpr: true, startsExpr: true }),
    // Operators. These carry several kinds of properties to help the
    // parser use them properly (the presence of these properties is
    // what categorizes them as operators).
    //
    // `binop`, when present, specifies that this operator is a binary
    // operator, and will refer to its precedence.
    //
    // `prefix` and `postfix` mark the operator as a prefix or postfix
    // unary operator.
    //
    // `isAssign` marks all of `=`, `+=`, `-=` etcetera, which act as
    // binary operators with a very low precedence, that should result
    // in AssignmentExpression nodes.
    eq: new TokenType("=", { beforeExpr: true, isAssign: true }),
    assign: new TokenType("_=", { beforeExpr: true, isAssign: true }),
    incDec: new TokenType("++/--", { prefix: true, postfix: true, startsExpr: true }),
    prefix: new TokenType("!/~", { beforeExpr: true, prefix: true, startsExpr: true }),
    logicalOR: binop("||", 1),
    logicalAND: binop("&&", 2),
    bitwiseOR: binop("|", 3),
    bitwiseXOR: binop("^", 4),
    bitwiseAND: binop("&", 5),
    equality: binop("==/!=/===/!==", 6),
    relational: binop("</>/<=/>=", 7),
    bitShift: binop("<</>>/>>>", 8),
    plusMin: new TokenType("+/-", { beforeExpr: true, binop: 9, prefix: true, startsExpr: true }),
    modulo: binop("%", 10),
    star: binop("*", 10),
    slash: binop("/", 10),
    starstar: new TokenType("**", { beforeExpr: true }),
    coalesce: binop("??", 1),
    // Keyword token types.
    _break: kw("break"),
    _case: kw("case", beforeExpr),
    _catch: kw("catch"),
    _continue: kw("continue"),
    _debugger: kw("debugger"),
    _default: kw("default", beforeExpr),
    _do: kw("do", { isLoop: true, beforeExpr: true }),
    _else: kw("else", beforeExpr),
    _finally: kw("finally"),
    _for: kw("for", { isLoop: true }),
    _function: kw("function", startsExpr),
    _if: kw("if"),
    _return: kw("return", beforeExpr),
    _switch: kw("switch"),
    _throw: kw("throw", beforeExpr),
    _try: kw("try"),
    _var: kw("var"),
    _const: kw("const"),
    _while: kw("while", { isLoop: true }),
    _with: kw("with"),
    _new: kw("new", { beforeExpr: true, startsExpr: true }),
    _this: kw("this", startsExpr),
    _super: kw("super", startsExpr),
    _class: kw("class", startsExpr),
    _extends: kw("extends", beforeExpr),
    _export: kw("export"),
    _import: kw("import", startsExpr),
    _null: kw("null", startsExpr),
    _true: kw("true", startsExpr),
    _false: kw("false", startsExpr),
    _in: kw("in", { beforeExpr: true, binop: 7 }),
    _instanceof: kw("instanceof", { beforeExpr: true, binop: 7 }),
    _typeof: kw("typeof", { beforeExpr: true, prefix: true, startsExpr: true }),
    _void: kw("void", { beforeExpr: true, prefix: true, startsExpr: true }),
    _delete: kw("delete", { beforeExpr: true, prefix: true, startsExpr: true })
  };
  var lineBreak = /\r\n?|\n|\u2028|\u2029/;
  var lineBreakG = new RegExp(lineBreak.source, "g");
  function isNewLine(code) {
    return code === 10 || code === 13 || code === 8232 || code === 8233;
  }
  function nextLineBreak(code, from, end) {
    if (end === void 0) end = code.length;
    for (var i = from; i < end; i++) {
      var next2 = code.charCodeAt(i);
      if (isNewLine(next2)) {
        return i < end - 1 && next2 === 13 && code.charCodeAt(i + 1) === 10 ? i + 2 : i + 1;
      }
    }
    return -1;
  }
  var nonASCIIwhitespace = /[\u1680\u2000-\u200a\u202f\u205f\u3000\ufeff]/;
  var skipWhiteSpace = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;
  var ref = Object.prototype;
  var hasOwnProperty = ref.hasOwnProperty;
  var toString = ref.toString;
  var hasOwn = Object.hasOwn || (function(obj, propName) {
    return hasOwnProperty.call(obj, propName);
  });
  var isArray = Array.isArray || (function(obj) {
    return toString.call(obj) === "[object Array]";
  });
  var regexpCache = /* @__PURE__ */ Object.create(null);
  function wordsRegexp(words) {
    return regexpCache[words] || (regexpCache[words] = new RegExp("^(?:" + words.replace(/ /g, "|") + ")$"));
  }
  function codePointToString(code) {
    if (code <= 65535) {
      return String.fromCharCode(code);
    }
    code -= 65536;
    return String.fromCharCode((code >> 10) + 55296, (code & 1023) + 56320);
  }
  var loneSurrogate = /(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/;
  var Position = function Position2(line, col) {
    this.line = line;
    this.column = col;
  };
  Position.prototype.offset = function offset(n) {
    return new Position(this.line, this.column + n);
  };
  var SourceLocation = function SourceLocation2(p, start, end) {
    this.start = start;
    this.end = end;
    if (p.sourceFile !== null) {
      this.source = p.sourceFile;
    }
  };
  function getLineInfo(input2, offset2) {
    for (var line = 1, cur = 0; ; ) {
      var nextBreak = nextLineBreak(input2, cur, offset2);
      if (nextBreak < 0) {
        return new Position(line, offset2 - cur);
      }
      ++line;
      cur = nextBreak;
    }
  }
  var defaultOptions = {
    // `ecmaVersion` indicates the ECMAScript version to parse. Must be
    // either 3, 5, 6 (or 2015), 7 (2016), 8 (2017), 9 (2018), 10
    // (2019), 11 (2020), 12 (2021), 13 (2022), 14 (2023), or `"latest"`
    // (the latest version the library supports). This influences
    // support for strict mode, the set of reserved words, and support
    // for new syntax features.
    ecmaVersion: null,
    // `sourceType` indicates the mode the code should be parsed in.
    // Can be either `"script"`, `"module"` or `"commonjs"`. This influences global
    // strict mode and parsing of `import` and `export` declarations.
    sourceType: "script",
    // When set to true, enable strict parsing mode even if `sourceType`
    // is `"script"`.
    strict: false,
    // `onInsertedSemicolon` can be a callback that will be called when
    // a semicolon is automatically inserted. It will be passed the
    // position of the inserted semicolon as an offset, and if
    // `locations` is enabled, it is given the location as a `{line,
    // column}` object as second argument.
    onInsertedSemicolon: null,
    // `onTrailingComma` is similar to `onInsertedSemicolon`, but for
    // trailing commas.
    onTrailingComma: null,
    // By default, reserved words are only enforced if ecmaVersion >= 5.
    // Set `allowReserved` to a boolean value to explicitly turn this on
    // an off. When this option has the value "never", reserved words
    // and keywords can also not be used as property names.
    allowReserved: null,
    // When enabled, a return at the top level is not considered an
    // error.
    allowReturnOutsideFunction: false,
    // When enabled, import/export statements are not constrained to
    // appearing at the top of the program, and an import.meta expression
    // in a script isn't considered an error.
    allowImportExportEverywhere: false,
    // By default, await identifiers are allowed to appear at the top-level scope only if ecmaVersion >= 2022.
    // When enabled, await identifiers are allowed to appear at the top-level scope,
    // but they are still not allowed in non-async functions.
    allowAwaitOutsideFunction: null,
    // When enabled, super identifiers are not constrained to
    // appearing in methods and do not raise an error when they appear elsewhere.
    allowSuperOutsideMethod: null,
    // When enabled, hashbang directive in the beginning of file is
    // allowed and treated as a line comment. Enabled by default when
    // `ecmaVersion` >= 2023.
    allowHashBang: false,
    // By default, the parser will verify that private properties are
    // only used in places where they are valid and have been declared.
    // Set this to false to turn such checks off.
    checkPrivateFields: true,
    // When `locations` is on, `loc` properties holding objects with
    // `start` and `end` properties in `{line, column}` form (with
    // line being 1-based and column 0-based) will be attached to the
    // nodes.
    locations: false,
    // Pass an optional `{line, column}` object to use for the start of
    // the parse. This is mostly useful when using `parseExpressionAt`
    // with `locations: true`, to prevent the parser from having to
    // determine the line position at the start position.
    startLocation: null,
    // A function can be passed as `onToken` option, which will
    // cause Acorn to call that function with object in the same
    // format as tokens returned from `tokenizer().getToken()`. Note
    // that you are not allowed to call the parser from the
    // callback—that will corrupt its internal state.
    onToken: null,
    // A function can be passed as `onComment` option, which will
    // cause Acorn to call that function with `(block, text, start,
    // end)` parameters whenever a comment is skipped. `block` is a
    // boolean indicating whether this is a block (`/* */`) comment,
    // `text` is the content of the comment, and `start` and `end` are
    // character offsets that denote the start and end of the comment.
    // When the `locations` option is on, two more parameters are
    // passed, the full `{line, column}` locations of the start and
    // end of the comments. Note that you are not allowed to call the
    // parser from the callback—that will corrupt its internal state.
    // When this option has an array as value, objects representing the
    // comments are pushed to it.
    onComment: null,
    // Nodes have their start and end characters offsets recorded in
    // `start` and `end` properties (directly on the node, rather than
    // the `loc` object, which holds line/column data. To also add a
    // [semi-standardized][range] `range` property holding a `[start,
    // end]` array with the same numbers, set the `ranges` option to
    // `true`.
    //
    // [range]: https://bugzilla.mozilla.org/show_bug.cgi?id=745678
    ranges: false,
    // It is possible to parse multiple files into a single AST by
    // passing the tree produced by parsing the first file as
    // `program` option in subsequent parses. This will add the
    // toplevel forms of the parsed file to the `Program` (top) node
    // of an existing parse tree.
    program: null,
    // When `locations` is on, you can pass this to record the source
    // file in every node's `loc` object.
    sourceFile: null,
    // This value, if given, is stored in every node, whether
    // `locations` is on or off.
    directSourceFile: null,
    // When enabled, parenthesized expressions are represented by
    // (non-standard) ParenthesizedExpression nodes
    preserveParens: false
  };
  var warnedAboutEcmaVersion = false;
  function getOptions(opts) {
    var options = {};
    for (var opt2 in defaultOptions) {
      options[opt2] = opts && hasOwn(opts, opt2) ? opts[opt2] : defaultOptions[opt2];
    }
    if (options.ecmaVersion === "latest") {
      options.ecmaVersion = 1e8;
    } else if (options.ecmaVersion == null) {
      if (!warnedAboutEcmaVersion && typeof console === "object" && console.warn) {
        warnedAboutEcmaVersion = true;
        console.warn("Since Acorn 8.0.0, options.ecmaVersion is required.\nDefaulting to 2020, but this will stop working in the future.");
      }
      options.ecmaVersion = 11;
    } else if (options.ecmaVersion >= 2015) {
      options.ecmaVersion -= 2009;
    }
    if (options.allowReserved == null) {
      options.allowReserved = options.ecmaVersion < 5;
    }
    if (!opts || opts.allowHashBang == null) {
      options.allowHashBang = options.ecmaVersion >= 14;
    }
    if (isArray(options.onToken)) {
      var tokens = options.onToken;
      options.onToken = function(token) {
        return tokens.push(token);
      };
    }
    if (isArray(options.onComment)) {
      options.onComment = pushComment(options, options.onComment);
    }
    if (options.sourceType === "commonjs" && options.allowAwaitOutsideFunction) {
      throw new Error("Cannot use allowAwaitOutsideFunction with sourceType: commonjs");
    }
    return options;
  }
  function pushComment(options, array2) {
    return function(block, text, start, end, startLoc, endLoc) {
      var comment = {
        type: block ? "Block" : "Line",
        value: text,
        start,
        end
      };
      if (options.locations) {
        comment.loc = new SourceLocation(this, startLoc, endLoc);
      }
      if (options.ranges) {
        comment.range = [start, end];
      }
      array2.push(comment);
    };
  }
  var SCOPE_TOP = 1;
  var SCOPE_FUNCTION = 2;
  var SCOPE_ASYNC = 4;
  var SCOPE_GENERATOR = 8;
  var SCOPE_ARROW = 16;
  var SCOPE_SIMPLE_CATCH = 32;
  var SCOPE_SUPER = 64;
  var SCOPE_DIRECT_SUPER = 128;
  var SCOPE_CLASS_STATIC_BLOCK = 256;
  var SCOPE_CLASS_FIELD_INIT = 512;
  var SCOPE_SWITCH = 1024;
  var SCOPE_VAR = SCOPE_TOP | SCOPE_FUNCTION | SCOPE_CLASS_STATIC_BLOCK;
  function functionFlags(async, generator) {
    return SCOPE_FUNCTION | (async ? SCOPE_ASYNC : 0) | (generator ? SCOPE_GENERATOR : 0);
  }
  var BIND_NONE = 0;
  var BIND_VAR = 1;
  var BIND_LEXICAL = 2;
  var BIND_FUNCTION = 3;
  var BIND_SIMPLE_CATCH = 4;
  var BIND_OUTSIDE = 5;
  var Parser = function Parser2(options, input2, startPos) {
    this.options = options = getOptions(options);
    this.sourceFile = options.sourceFile;
    this.keywords = wordsRegexp(keywords$1[options.ecmaVersion >= 6 ? 6 : options.sourceType === "module" ? "5module" : 5]);
    var reserved = "";
    if (options.allowReserved !== true) {
      reserved = reservedWords[options.ecmaVersion >= 6 ? 6 : options.ecmaVersion === 5 ? 5 : 3];
      if (options.sourceType === "module") {
        reserved += " await";
      }
    }
    this.reservedWords = wordsRegexp(reserved);
    var reservedStrict = (reserved ? reserved + " " : "") + reservedWords.strict;
    this.reservedWordsStrict = wordsRegexp(reservedStrict);
    this.reservedWordsStrictBind = wordsRegexp(reservedStrict + " " + reservedWords.strictBind);
    this.input = String(input2);
    this.containsEsc = false;
    this.pos = startPos || 0;
    this.curLine = 1;
    if (options.startLocation) {
      this.lineStart = this.pos - options.startLocation.column;
      this.curLine = options.startLocation.line;
    } else if (startPos) {
      this.lineStart = this.input.lastIndexOf("\n", startPos - 1) + 1;
      if (this.options.locations) {
        this.curLine = this.input.slice(0, this.lineStart).split(lineBreak).length;
      }
    } else {
      this.lineStart = 0;
    }
    this.type = types$1.eof;
    this.value = null;
    this.start = this.end = this.pos;
    this.startLoc = this.endLoc = this.curPosition();
    this.lastTokEndLoc = this.lastTokStartLoc = null;
    this.lastTokStart = this.lastTokEnd = this.pos;
    this.context = this.initialContext();
    this.exprAllowed = true;
    this.inModule = options.sourceType === "module";
    this.strict = this.inModule || options.strict === true || this.strictDirective(this.pos);
    this.potentialArrowAt = -1;
    this.potentialArrowInForAwait = false;
    this.yieldPos = this.awaitPos = this.awaitIdentPos = 0;
    this.labels = [];
    this.undefinedExports = /* @__PURE__ */ Object.create(null);
    if (this.pos === 0 && options.allowHashBang && this.input.slice(0, 2) === "#!") {
      this.skipLineComment(2);
    }
    this.scopeStack = [];
    this.enterScope(
      this.options.sourceType === "commonjs" ? SCOPE_FUNCTION : SCOPE_TOP
    );
    this.regexpState = null;
    this.privateNameStack = [];
  };
  var prototypeAccessors = { inFunction: { configurable: true }, inGenerator: { configurable: true }, inAsync: { configurable: true }, canAwait: { configurable: true }, allowReturn: { configurable: true }, allowSuper: { configurable: true }, allowDirectSuper: { configurable: true }, treatFunctionsAsVar: { configurable: true }, allowNewDotTarget: { configurable: true }, allowUsing: { configurable: true }, inClassStaticBlock: { configurable: true } };
  Parser.prototype.parse = function parse() {
    var this$1$1 = this;
    var node = this.options.program || this.startNode();
    this.nextToken();
    return this.catchStackOverflow(function() {
      return this$1$1.parseTopLevel(node);
    });
  };
  prototypeAccessors.inFunction.get = function() {
    return (this.currentVarScope().flags & SCOPE_FUNCTION) > 0;
  };
  prototypeAccessors.inGenerator.get = function() {
    return (this.currentVarScope().flags & SCOPE_GENERATOR) > 0;
  };
  prototypeAccessors.inAsync.get = function() {
    return (this.currentVarScope().flags & SCOPE_ASYNC) > 0;
  };
  prototypeAccessors.canAwait.get = function() {
    for (var i = this.scopeStack.length - 1; i >= 0; i--) {
      var ref2 = this.scopeStack[i];
      var flags = ref2.flags;
      if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT)) {
        return false;
      }
      if (flags & SCOPE_FUNCTION) {
        return (flags & SCOPE_ASYNC) > 0;
      }
    }
    return this.inModule && this.options.ecmaVersion >= 13 || this.options.allowAwaitOutsideFunction;
  };
  prototypeAccessors.allowReturn.get = function() {
    if (this.inFunction) {
      return true;
    }
    if (this.options.allowReturnOutsideFunction && this.currentVarScope().flags & SCOPE_TOP) {
      return true;
    }
    return false;
  };
  prototypeAccessors.allowSuper.get = function() {
    var ref2 = this.currentThisScope();
    var flags = ref2.flags;
    return (flags & SCOPE_SUPER) > 0 || this.options.allowSuperOutsideMethod;
  };
  prototypeAccessors.allowDirectSuper.get = function() {
    return (this.currentThisScope().flags & SCOPE_DIRECT_SUPER) > 0;
  };
  prototypeAccessors.treatFunctionsAsVar.get = function() {
    return this.treatFunctionsAsVarInScope(this.currentScope());
  };
  prototypeAccessors.allowNewDotTarget.get = function() {
    for (var i = this.scopeStack.length - 1; i >= 0; i--) {
      var ref2 = this.scopeStack[i];
      var flags = ref2.flags;
      if (flags & (SCOPE_CLASS_STATIC_BLOCK | SCOPE_CLASS_FIELD_INIT) || flags & SCOPE_FUNCTION && !(flags & SCOPE_ARROW)) {
        return true;
      }
    }
    return false;
  };
  prototypeAccessors.allowUsing.get = function() {
    var ref2 = this.currentScope();
    var flags = ref2.flags;
    if (flags & SCOPE_SWITCH) {
      return false;
    }
    if (!this.inModule && flags & SCOPE_TOP) {
      return false;
    }
    return true;
  };
  prototypeAccessors.inClassStaticBlock.get = function() {
    return (this.currentVarScope().flags & SCOPE_CLASS_STATIC_BLOCK) > 0;
  };
  Parser.extend = function extend() {
    var plugins = [], len = arguments.length;
    while (len--) plugins[len] = arguments[len];
    var cls = this;
    for (var i = 0; i < plugins.length; i++) {
      cls = plugins[i](cls);
    }
    return cls;
  };
  Parser.parse = function parse2(input2, options) {
    return new this(options, input2).parse();
  };
  Parser.parseExpressionAt = function parseExpressionAt(input2, pos, options) {
    var parser = new this(options, input2, pos);
    parser.nextToken();
    return parser.parseExpression();
  };
  Parser.tokenizer = function tokenizer(input2, options) {
    return new this(options, input2);
  };
  Object.defineProperties(Parser.prototype, prototypeAccessors);
  var pp$9 = Parser.prototype;
  var literal = /^(?:'((?:\\[^]|[^'\\])*?)'|"((?:\\[^]|[^"\\])*?)")/;
  pp$9.strictDirective = function(start) {
    if (this.options.ecmaVersion < 5) {
      return false;
    }
    for (; ; ) {
      skipWhiteSpace.lastIndex = start;
      start += skipWhiteSpace.exec(this.input)[0].length;
      var match2 = literal.exec(this.input.slice(start));
      if (!match2) {
        return false;
      }
      if ((match2[1] || match2[2]) === "use strict") {
        skipWhiteSpace.lastIndex = start + match2[0].length;
        var spaceAfter = skipWhiteSpace.exec(this.input), end = spaceAfter.index + spaceAfter[0].length;
        var next2 = this.input.charAt(end);
        return next2 === ";" || next2 === "}" || lineBreak.test(spaceAfter[0]) && !(/[(`.[+\-/*%<>=,?^&]/.test(next2) || next2 === "!" && this.input.charAt(end + 1) === "=" || next2 === "i" && keywordOpAt(this, end));
      }
      start += match2[0].length;
      skipWhiteSpace.lastIndex = start;
      start += skipWhiteSpace.exec(this.input)[0].length;
      if (this.input[start] === ";") {
        start++;
      }
    }
  };
  function keywordOpAt(parser, pos) {
    var end = pos + 1, stop = Math.min(parser.input.length, pos + 11);
    while (end < stop) {
      var ch = parser.fullCharCodeAt(end);
      if (!isIdentifierChar(ch, true)) {
        break;
      }
      end += ch <= 65535 ? 1 : 2;
    }
    return end === pos + 2 && parser.input.slice(pos, end) === "in" || end === pos + 10 && parser.input.slice(pos, end) === "instanceof";
  }
  pp$9.eat = function(type) {
    if (this.type === type) {
      this.next();
      return true;
    } else {
      return false;
    }
  };
  pp$9.isContextual = function(name) {
    return this.type === types$1.name && this.value === name && !this.containsEsc;
  };
  pp$9.eatContextual = function(name) {
    if (!this.isContextual(name)) {
      return false;
    }
    this.next();
    return true;
  };
  pp$9.catchStackOverflow = function(f) {
    try {
      return f();
    } catch (e) {
      if (e instanceof Error && (/\bstack\b.*\b(exceeded|overflow)\b/i.test(e.message) || /\btoo much recursion\b/i.test(e.message))) {
        this.raise(this.start, "Not enough stack space to parse input");
      } else {
        throw e;
      }
    }
  };
  pp$9.expectContextual = function(name) {
    if (!this.eatContextual(name)) {
      this.unexpected();
    }
  };
  pp$9.canInsertSemicolon = function() {
    return this.type === types$1.eof || this.type === types$1.braceR || lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
  };
  pp$9.insertSemicolon = function() {
    if (this.canInsertSemicolon()) {
      if (this.options.onInsertedSemicolon) {
        this.options.onInsertedSemicolon(this.lastTokEnd, this.lastTokEndLoc);
      }
      return true;
    }
  };
  pp$9.semicolon = function() {
    if (!this.eat(types$1.semi) && !this.insertSemicolon()) {
      this.unexpected();
    }
  };
  pp$9.afterTrailingComma = function(tokType, notNext) {
    if (this.type === tokType) {
      if (this.options.onTrailingComma) {
        this.options.onTrailingComma(this.lastTokStart, this.lastTokStartLoc);
      }
      if (!notNext) {
        this.next();
      }
      return true;
    }
  };
  pp$9.expect = function(type) {
    this.eat(type) || this.unexpected();
  };
  pp$9.unexpected = function(pos) {
    this.raise(pos != null ? pos : this.start, "Unexpected token");
  };
  var DestructuringErrors = function DestructuringErrors2() {
    this.shorthandAssign = this.trailingComma = this.parenthesizedAssign = this.parenthesizedBind = this.doubleProto = -1;
  };
  pp$9.checkPatternErrors = function(refDestructuringErrors, isAssign) {
    if (!refDestructuringErrors) {
      return;
    }
    if (refDestructuringErrors.trailingComma > -1) {
      this.raiseRecoverable(refDestructuringErrors.trailingComma, "Comma is not permitted after the rest element");
    }
    var parens = isAssign ? refDestructuringErrors.parenthesizedAssign : refDestructuringErrors.parenthesizedBind;
    if (parens > -1) {
      this.raiseRecoverable(parens, isAssign ? "Assigning to rvalue" : "Parenthesized pattern");
    }
  };
  pp$9.checkExpressionErrors = function(refDestructuringErrors, andThrow) {
    if (!refDestructuringErrors) {
      return false;
    }
    var shorthandAssign = refDestructuringErrors.shorthandAssign;
    var doubleProto = refDestructuringErrors.doubleProto;
    if (!andThrow) {
      return shorthandAssign >= 0 || doubleProto >= 0;
    }
    if (shorthandAssign >= 0) {
      this.raise(shorthandAssign, "Shorthand property assignments are valid only in destructuring patterns");
    }
    if (doubleProto >= 0) {
      this.raiseRecoverable(doubleProto, "Redefinition of __proto__ property");
    }
  };
  pp$9.checkYieldAwaitInDefaultParams = function() {
    if (this.yieldPos && (!this.awaitPos || this.yieldPos < this.awaitPos)) {
      this.raise(this.yieldPos, "Yield expression cannot be a default value");
    }
    if (this.awaitPos) {
      this.raise(this.awaitPos, "Await expression cannot be a default value");
    }
  };
  pp$9.isSimpleAssignTarget = function(expr) {
    if (expr.type === "ParenthesizedExpression") {
      return this.isSimpleAssignTarget(expr.expression);
    }
    return expr.type === "Identifier" || expr.type === "MemberExpression";
  };
  var pp$8 = Parser.prototype;
  pp$8.parseTopLevel = function(node) {
    var exports$1 = /* @__PURE__ */ Object.create(null);
    if (!node.body) {
      node.body = [];
    }
    while (this.type !== types$1.eof) {
      var stmt = this.parseStatement(null, true, exports$1);
      node.body.push(stmt);
    }
    if (this.inModule) {
      for (var i = 0, list = Object.keys(this.undefinedExports); i < list.length; i += 1) {
        var name = list[i];
        this.raiseRecoverable(this.undefinedExports[name].start, "Export '" + name + "' is not defined");
      }
    }
    this.adaptDirectivePrologue(node.body);
    this.next();
    node.sourceType = this.options.sourceType === "commonjs" ? "script" : this.options.sourceType;
    return this.finishNode(node, "Program");
  };
  var loopLabel = { kind: "loop" };
  var switchLabel = { kind: "switch" };
  pp$8.isLet = function(context) {
    if (this.options.ecmaVersion < 6 || !this.isContextual("let")) {
      return false;
    }
    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next2 = this.pos + skip[0].length, nextCh = this.fullCharCodeAt(next2);
    if (nextCh === 91 || nextCh === 92) {
      return true;
    }
    if (context) {
      return false;
    }
    if (nextCh === 123) {
      return true;
    }
    if (isIdentifierStart(nextCh)) {
      var start = next2;
      do {
        next2 += nextCh <= 65535 ? 1 : 2;
      } while (isIdentifierChar(nextCh = this.fullCharCodeAt(next2)));
      if (nextCh === 92) {
        return true;
      }
      var ident = this.input.slice(start, next2);
      if (!keywordRelationalOperator.test(ident)) {
        return true;
      }
    }
    return false;
  };
  pp$8.isAsyncFunction = function() {
    if (this.options.ecmaVersion < 8 || !this.isContextual("async")) {
      return false;
    }
    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next2 = this.pos + skip[0].length, after;
    return !lineBreak.test(this.input.slice(this.pos, next2)) && this.input.slice(next2, next2 + 8) === "function" && (next2 + 8 === this.input.length || !(isIdentifierChar(after = this.fullCharCodeAt(next2 + 8)) || after === 92));
  };
  pp$8.isUsingKeyword = function(isAwaitUsing, isFor) {
    if (this.options.ecmaVersion < 17 || !this.isContextual(isAwaitUsing ? "await" : "using")) {
      return false;
    }
    skipWhiteSpace.lastIndex = this.pos;
    var skip = skipWhiteSpace.exec(this.input);
    var next2 = this.pos + skip[0].length;
    if (lineBreak.test(this.input.slice(this.pos, next2))) {
      return false;
    }
    if (isAwaitUsing) {
      var usingEndPos = next2 + 5, after;
      if (this.input.slice(next2, usingEndPos) !== "using" || usingEndPos === this.input.length || isIdentifierChar(after = this.fullCharCodeAt(usingEndPos)) || after === 92) {
        return false;
      }
      skipWhiteSpace.lastIndex = usingEndPos;
      var skipAfterUsing = skipWhiteSpace.exec(this.input);
      next2 = usingEndPos + skipAfterUsing[0].length;
      if (skipAfterUsing && lineBreak.test(this.input.slice(usingEndPos, next2))) {
        return false;
      }
    }
    var ch = this.fullCharCodeAt(next2);
    if (!isIdentifierStart(ch) && ch !== 92) {
      return false;
    }
    var idStart = next2;
    do {
      next2 += ch <= 65535 ? 1 : 2;
    } while (isIdentifierChar(ch = this.fullCharCodeAt(next2)));
    if (ch === 92) {
      return true;
    }
    var id = this.input.slice(idStart, next2);
    if (keywordRelationalOperator.test(id)) {
      return false;
    }
    if (isFor && !isAwaitUsing && id === "of") {
      skipWhiteSpace.lastIndex = next2;
      var skipAfterOf = skipWhiteSpace.exec(this.input);
      next2 = next2 + skipAfterOf[0].length;
      if (this.input.charCodeAt(next2) !== 61 || // Check for ==, === and => operators
      (ch = this.input.charCodeAt(next2 + 1)) === 61 || ch === 62) {
        return false;
      }
    }
    return true;
  };
  pp$8.isAwaitUsing = function(isFor) {
    return this.isUsingKeyword(true, isFor);
  };
  pp$8.isUsing = function(isFor) {
    return this.isUsingKeyword(false, isFor);
  };
  pp$8.parseStatement = function(context, topLevel, exports$1) {
    var starttype = this.type, node = this.startNode(), kind;
    if (this.isLet(context)) {
      starttype = types$1._var;
      kind = "let";
    }
    switch (starttype) {
      case types$1._break:
      case types$1._continue:
        return this.parseBreakContinueStatement(node, starttype.keyword);
      case types$1._debugger:
        return this.parseDebuggerStatement(node);
      case types$1._do:
        return this.parseDoStatement(node);
      case types$1._for:
        return this.parseForStatement(node);
      case types$1._function:
        if (context && (this.strict || context !== "if" && context !== "label") && this.options.ecmaVersion >= 6) {
          this.unexpected();
        }
        return this.parseFunctionStatement(node, false, !context);
      case types$1._class:
        if (context) {
          this.unexpected();
        }
        return this.parseClass(node, true);
      case types$1._if:
        return this.parseIfStatement(node);
      case types$1._return:
        return this.parseReturnStatement(node);
      case types$1._switch:
        return this.parseSwitchStatement(node);
      case types$1._throw:
        return this.parseThrowStatement(node);
      case types$1._try:
        return this.parseTryStatement(node);
      case types$1._const:
      case types$1._var:
        kind = kind || this.value;
        if (context && kind !== "var") {
          this.unexpected();
        }
        return this.parseVarStatement(node, kind);
      case types$1._while:
        return this.parseWhileStatement(node);
      case types$1._with:
        return this.parseWithStatement(node);
      case types$1.braceL:
        return this.parseBlock(true, node);
      case types$1.semi:
        return this.parseEmptyStatement(node);
      case types$1._export:
      case types$1._import:
        if (this.options.ecmaVersion > 10 && starttype === types$1._import) {
          skipWhiteSpace.lastIndex = this.pos;
          var skip = skipWhiteSpace.exec(this.input);
          var next2 = this.pos + skip[0].length, nextCh = this.input.charCodeAt(next2);
          if (nextCh === 40 || nextCh === 46) {
            return this.parseExpressionStatement(node, this.parseExpression());
          }
        }
        if (!this.options.allowImportExportEverywhere) {
          if (!topLevel) {
            this.raise(this.start, "'import' and 'export' may only appear at the top level");
          }
          if (!this.inModule) {
            this.raise(this.start, "'import' and 'export' may appear only with 'sourceType: module'");
          }
        }
        return starttype === types$1._import ? this.parseImport(node) : this.parseExport(node, exports$1);
      // If the statement does not start with a statement keyword or a
      // brace, it's an ExpressionStatement or LabeledStatement. We
      // simply start parsing an expression, and afterwards, if the
      // next token is a colon and the expression was a simple
      // Identifier node, we switch to interpreting it as a label.
      default:
        if (this.isAsyncFunction()) {
          if (context) {
            this.unexpected();
          }
          this.next();
          return this.parseFunctionStatement(node, true, !context);
        }
        var usingKind = this.isAwaitUsing(false) ? "await using" : this.isUsing(false) ? "using" : null;
        if (usingKind) {
          if (!this.allowUsing) {
            this.raise(this.start, "Using declaration cannot appear in the top level when source type is `script` or in the bare case statement");
          }
          if (context) {
            this.raise(this.start, "Using declaration is not allowed in single-statement positions");
          }
          if (usingKind === "await using") {
            if (!this.canAwait) {
              this.raise(this.start, "Await using cannot appear outside of async function");
            }
            this.next();
          }
          this.next();
          this.parseVar(node, false, usingKind);
          this.semicolon();
          return this.finishNode(node, "VariableDeclaration");
        }
        var maybeName = this.value, expr = this.parseExpression();
        if (starttype === types$1.name && expr.type === "Identifier" && this.eat(types$1.colon)) {
          return this.parseLabeledStatement(node, maybeName, expr, context);
        } else {
          return this.parseExpressionStatement(node, expr);
        }
    }
  };
  pp$8.parseBreakContinueStatement = function(node, keyword) {
    var isBreak = keyword === "break";
    this.next();
    if (this.eat(types$1.semi) || this.insertSemicolon()) {
      node.label = null;
    } else if (this.type !== types$1.name) {
      this.unexpected();
    } else {
      node.label = this.parseIdent();
      this.semicolon();
    }
    var i = 0;
    for (; i < this.labels.length; ++i) {
      var lab = this.labels[i];
      if (node.label == null || lab.name === node.label.name) {
        if (lab.kind != null && (isBreak || lab.kind === "loop")) {
          break;
        }
        if (node.label && isBreak) {
          break;
        }
      }
    }
    if (i === this.labels.length) {
      this.raise(node.start, "Unsyntactic " + keyword);
    }
    return this.finishNode(node, isBreak ? "BreakStatement" : "ContinueStatement");
  };
  pp$8.parseDebuggerStatement = function(node) {
    this.next();
    this.semicolon();
    return this.finishNode(node, "DebuggerStatement");
  };
  pp$8.parseDoStatement = function(node) {
    this.next();
    this.labels.push(loopLabel);
    node.body = this.parseStatement("do");
    this.labels.pop();
    this.expect(types$1._while);
    node.test = this.parseParenExpression();
    if (this.options.ecmaVersion >= 6) {
      this.eat(types$1.semi);
    } else {
      this.semicolon();
    }
    return this.finishNode(node, "DoWhileStatement");
  };
  pp$8.parseForStatement = function(node) {
    this.next();
    var awaitAt = this.options.ecmaVersion >= 9 && this.canAwait && this.eatContextual("await") ? this.lastTokStart : -1;
    this.labels.push(loopLabel);
    this.enterScope(0);
    this.expect(types$1.parenL);
    if (this.type === types$1.semi) {
      if (awaitAt > -1) {
        this.unexpected(awaitAt);
      }
      return this.parseFor(node, null);
    }
    var isLet = this.isLet();
    if (this.type === types$1._var || this.type === types$1._const || isLet) {
      var init$1 = this.startNode(), kind = isLet ? "let" : this.value;
      this.next();
      this.parseVar(init$1, true, kind);
      this.finishNode(init$1, "VariableDeclaration");
      return this.parseForAfterInit(node, init$1, awaitAt);
    }
    var startsWithLet = this.isContextual("let"), isForOf = false;
    var usingKind = this.isUsing(true) ? "using" : this.isAwaitUsing(true) ? "await using" : null;
    if (usingKind) {
      var init$2 = this.startNode();
      this.next();
      if (usingKind === "await using") {
        if (!this.canAwait) {
          this.raise(this.start, "Await using cannot appear outside of async function");
        }
        this.next();
      }
      this.parseVar(init$2, true, usingKind);
      this.finishNode(init$2, "VariableDeclaration");
      return this.parseForAfterInit(node, init$2, awaitAt);
    }
    var containsEsc = this.containsEsc;
    var refDestructuringErrors = new DestructuringErrors();
    var initPos = this.start;
    var init = awaitAt > -1 ? this.parseExprSubscripts(refDestructuringErrors, "await") : this.parseExpression(true, refDestructuringErrors);
    if (this.type === types$1._in || (isForOf = this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
      if (awaitAt > -1) {
        if (this.type === types$1._in) {
          this.unexpected(awaitAt);
        }
        node.await = true;
      } else if (isForOf && this.options.ecmaVersion >= 8) {
        if (init.start === initPos && !containsEsc && init.type === "Identifier" && init.name === "async") {
          this.unexpected();
        } else if (this.options.ecmaVersion >= 9) {
          node.await = false;
        }
      }
      if (startsWithLet && isForOf) {
        this.raise(init.start, "The left-hand side of a for-of loop may not start with 'let'.");
      }
      this.toAssignable(init, false, refDestructuringErrors);
      this.checkLValPattern(init);
      return this.parseForIn(node, init);
    } else {
      this.checkExpressionErrors(refDestructuringErrors, true);
    }
    if (awaitAt > -1) {
      this.unexpected(awaitAt);
    }
    return this.parseFor(node, init);
  };
  pp$8.parseForAfterInit = function(node, init, awaitAt) {
    if ((this.type === types$1._in || this.options.ecmaVersion >= 6 && this.isContextual("of")) && init.declarations.length === 1) {
      if (this.type === types$1._in) {
        if ((init.kind === "using" || init.kind === "await using") && !init.declarations[0].init) {
          this.raise(this.start, "Using declaration is not allowed in for-in loops");
        }
        if (this.options.ecmaVersion >= 9 && awaitAt > -1) {
          this.unexpected(awaitAt);
        }
      } else if (this.options.ecmaVersion >= 9) {
        node.await = awaitAt > -1;
      }
      return this.parseForIn(node, init);
    }
    if (awaitAt > -1) {
      this.unexpected(awaitAt);
    }
    return this.parseFor(node, init);
  };
  pp$8.parseFunctionStatement = function(node, isAsync, declarationPosition) {
    this.next();
    return this.parseFunction(node, FUNC_STATEMENT | (declarationPosition ? 0 : FUNC_HANGING_STATEMENT), false, isAsync);
  };
  pp$8.parseIfStatement = function(node) {
    this.next();
    node.test = this.parseParenExpression();
    node.consequent = this.parseStatement("if");
    node.alternate = this.eat(types$1._else) ? this.parseStatement("if") : null;
    return this.finishNode(node, "IfStatement");
  };
  pp$8.parseReturnStatement = function(node) {
    if (!this.allowReturn) {
      this.raise(this.start, "'return' outside of function");
    }
    this.next();
    if (this.eat(types$1.semi) || this.insertSemicolon()) {
      node.argument = null;
    } else {
      node.argument = this.parseExpression();
      this.semicolon();
    }
    return this.finishNode(node, "ReturnStatement");
  };
  pp$8.parseSwitchStatement = function(node) {
    this.next();
    node.discriminant = this.parseParenExpression();
    node.cases = [];
    this.expect(types$1.braceL);
    this.labels.push(switchLabel);
    this.enterScope(SCOPE_SWITCH);
    var cur;
    for (var sawDefault = false; this.type !== types$1.braceR; ) {
      if (this.type === types$1._case || this.type === types$1._default) {
        var isCase = this.type === types$1._case;
        if (cur) {
          this.finishNode(cur, "SwitchCase");
        }
        node.cases.push(cur = this.startNode());
        cur.consequent = [];
        this.next();
        if (isCase) {
          cur.test = this.parseExpression();
        } else {
          if (sawDefault) {
            this.raiseRecoverable(this.lastTokStart, "Multiple default clauses");
          }
          sawDefault = true;
          cur.test = null;
        }
        this.expect(types$1.colon);
      } else {
        if (!cur) {
          this.unexpected();
        }
        cur.consequent.push(this.parseStatement(null));
      }
    }
    this.exitScope();
    if (cur) {
      this.finishNode(cur, "SwitchCase");
    }
    this.next();
    this.labels.pop();
    return this.finishNode(node, "SwitchStatement");
  };
  pp$8.parseThrowStatement = function(node) {
    this.next();
    if (lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) {
      this.raise(this.lastTokEnd, "Illegal newline after throw");
    }
    node.argument = this.parseExpression();
    this.semicolon();
    return this.finishNode(node, "ThrowStatement");
  };
  var empty$1 = [];
  pp$8.parseCatchClauseParam = function() {
    var param = this.parseBindingAtom();
    var simple = param.type === "Identifier";
    this.enterScope(simple ? SCOPE_SIMPLE_CATCH : 0);
    this.checkLValPattern(param, simple ? BIND_SIMPLE_CATCH : BIND_LEXICAL);
    this.expect(types$1.parenR);
    return param;
  };
  pp$8.parseTryStatement = function(node) {
    this.next();
    node.block = this.parseBlock();
    node.handler = null;
    if (this.type === types$1._catch) {
      var clause = this.startNode();
      this.next();
      if (this.eat(types$1.parenL)) {
        clause.param = this.parseCatchClauseParam();
      } else {
        if (this.options.ecmaVersion < 10) {
          this.unexpected();
        }
        clause.param = null;
        this.enterScope(0);
      }
      clause.body = this.parseBlock(false);
      this.exitScope();
      node.handler = this.finishNode(clause, "CatchClause");
    }
    node.finalizer = this.eat(types$1._finally) ? this.parseBlock() : null;
    if (!node.handler && !node.finalizer) {
      this.raise(node.start, "Missing catch or finally clause");
    }
    return this.finishNode(node, "TryStatement");
  };
  pp$8.parseVarStatement = function(node, kind, allowMissingInitializer) {
    this.next();
    this.parseVar(node, false, kind, allowMissingInitializer);
    this.semicolon();
    return this.finishNode(node, "VariableDeclaration");
  };
  pp$8.parseWhileStatement = function(node) {
    this.next();
    node.test = this.parseParenExpression();
    this.labels.push(loopLabel);
    node.body = this.parseStatement("while");
    this.labels.pop();
    return this.finishNode(node, "WhileStatement");
  };
  pp$8.parseWithStatement = function(node) {
    if (this.strict) {
      this.raise(this.start, "'with' in strict mode");
    }
    this.next();
    node.object = this.parseParenExpression();
    node.body = this.parseStatement("with");
    return this.finishNode(node, "WithStatement");
  };
  pp$8.parseEmptyStatement = function(node) {
    this.next();
    return this.finishNode(node, "EmptyStatement");
  };
  pp$8.parseLabeledStatement = function(node, maybeName, expr, context) {
    for (var i$1 = 0, list = this.labels; i$1 < list.length; i$1 += 1) {
      var label = list[i$1];
      if (label.name === maybeName) {
        this.raise(expr.start, "Label '" + maybeName + "' is already declared");
      }
    }
    var kind = this.type.isLoop ? "loop" : this.type === types$1._switch ? "switch" : null;
    for (var i = this.labels.length - 1; i >= 0; i--) {
      var label$1 = this.labels[i];
      if (label$1.statementStart === node.start) {
        label$1.statementStart = this.start;
        label$1.kind = kind;
      } else {
        break;
      }
    }
    this.labels.push({ name: maybeName, kind, statementStart: this.start });
    node.body = this.parseStatement(context ? context.indexOf("label") === -1 ? context + "label" : context : "label");
    this.labels.pop();
    node.label = expr;
    return this.finishNode(node, "LabeledStatement");
  };
  pp$8.parseExpressionStatement = function(node, expr) {
    node.expression = expr;
    this.semicolon();
    return this.finishNode(node, "ExpressionStatement");
  };
  pp$8.parseBlock = function(createNewLexicalScope, node, exitStrict) {
    if (createNewLexicalScope === void 0) createNewLexicalScope = true;
    if (node === void 0) node = this.startNode();
    node.body = [];
    this.expect(types$1.braceL);
    if (createNewLexicalScope) {
      this.enterScope(0);
    }
    while (this.type !== types$1.braceR) {
      var stmt = this.parseStatement(null);
      node.body.push(stmt);
    }
    if (exitStrict) {
      this.strict = false;
    }
    this.next();
    if (createNewLexicalScope) {
      this.exitScope();
    }
    return this.finishNode(node, "BlockStatement");
  };
  pp$8.parseFor = function(node, init) {
    node.init = init;
    this.expect(types$1.semi);
    node.test = this.type === types$1.semi ? null : this.parseExpression();
    this.expect(types$1.semi);
    node.update = this.type === types$1.parenR ? null : this.parseExpression();
    this.expect(types$1.parenR);
    node.body = this.parseStatement("for");
    this.exitScope();
    this.labels.pop();
    return this.finishNode(node, "ForStatement");
  };
  pp$8.parseForIn = function(node, init) {
    var isForIn = this.type === types$1._in;
    this.next();
    if (init.type === "VariableDeclaration" && init.declarations[0].init != null && (!isForIn || this.options.ecmaVersion < 8 || this.strict || init.kind !== "var" || init.declarations[0].id.type !== "Identifier")) {
      this.raise(
        init.start,
        (isForIn ? "for-in" : "for-of") + " loop variable declaration may not have an initializer"
      );
    }
    node.left = init;
    node.right = isForIn ? this.parseExpression() : this.parseMaybeAssign();
    this.expect(types$1.parenR);
    node.body = this.parseStatement("for");
    this.exitScope();
    this.labels.pop();
    return this.finishNode(node, isForIn ? "ForInStatement" : "ForOfStatement");
  };
  pp$8.parseVar = function(node, isFor, kind, allowMissingInitializer) {
    node.declarations = [];
    node.kind = kind;
    for (; ; ) {
      var decl = this.startNode();
      this.parseVarId(decl, kind);
      if (this.eat(types$1.eq)) {
        decl.init = this.parseMaybeAssign(isFor);
      } else if (!allowMissingInitializer && kind === "const" && !(this.type === types$1._in || this.options.ecmaVersion >= 6 && this.isContextual("of"))) {
        this.unexpected();
      } else if (!allowMissingInitializer && (kind === "using" || kind === "await using") && this.options.ecmaVersion >= 17 && this.type !== types$1._in && !this.isContextual("of")) {
        this.raise(this.lastTokEnd, "Missing initializer in " + kind + " declaration");
      } else if (!allowMissingInitializer && decl.id.type !== "Identifier" && !(isFor && (this.type === types$1._in || this.isContextual("of")))) {
        this.raise(this.lastTokEnd, "Complex binding patterns require an initialization value");
      } else {
        decl.init = null;
      }
      node.declarations.push(this.finishNode(decl, "VariableDeclarator"));
      if (!this.eat(types$1.comma)) {
        break;
      }
    }
    return node;
  };
  pp$8.parseVarId = function(decl, kind) {
    decl.id = kind === "using" || kind === "await using" ? this.parseIdent() : this.parseBindingAtom();
    this.checkLValPattern(decl.id, kind === "var" ? BIND_VAR : BIND_LEXICAL, false);
  };
  var FUNC_STATEMENT = 1;
  var FUNC_HANGING_STATEMENT = 2;
  var FUNC_NULLABLE_ID = 4;
  pp$8.parseFunction = function(node, statement, allowExpressionBody, isAsync, forInit) {
    this.initFunction(node);
    if (this.options.ecmaVersion >= 9 || this.options.ecmaVersion >= 6 && !isAsync) {
      if (this.type === types$1.star && statement & FUNC_HANGING_STATEMENT) {
        this.unexpected();
      }
      node.generator = this.eat(types$1.star);
    }
    if (this.options.ecmaVersion >= 8) {
      node.async = !!isAsync;
    }
    if (statement & FUNC_STATEMENT) {
      node.id = statement & FUNC_NULLABLE_ID && this.type !== types$1.name ? null : this.parseIdent();
      if (node.id && !(statement & FUNC_HANGING_STATEMENT)) {
        this.checkLValSimple(node.id, this.strict || node.generator || node.async ? this.treatFunctionsAsVar ? BIND_VAR : BIND_LEXICAL : BIND_FUNCTION);
      }
    }
    var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    this.enterScope(functionFlags(node.async, node.generator));
    if (!(statement & FUNC_STATEMENT)) {
      node.id = this.type === types$1.name ? this.parseIdent() : null;
    }
    this.parseFunctionParams(node);
    this.parseFunctionBody(node, allowExpressionBody, false, forInit);
    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, statement & FUNC_STATEMENT ? "FunctionDeclaration" : "FunctionExpression");
  };
  pp$8.parseFunctionParams = function(node) {
    this.expect(types$1.parenL);
    node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
    this.checkYieldAwaitInDefaultParams();
  };
  pp$8.parseClass = function(node, isStatement) {
    this.next();
    var oldStrict = this.strict;
    this.strict = true;
    this.parseClassId(node, isStatement);
    this.parseClassSuper(node);
    var privateNameMap = this.enterClassBody();
    var classBody = this.startNode();
    var hadConstructor = false;
    classBody.body = [];
    this.expect(types$1.braceL);
    while (this.type !== types$1.braceR) {
      var element = this.parseClassElement(node.superClass !== null);
      if (element) {
        classBody.body.push(element);
        if (element.type === "MethodDefinition" && element.kind === "constructor") {
          if (hadConstructor) {
            this.raiseRecoverable(element.start, "Duplicate constructor in the same class");
          }
          hadConstructor = true;
        } else if (element.key && element.key.type === "PrivateIdentifier" && isPrivateNameConflicted(privateNameMap, element)) {
          this.raiseRecoverable(element.key.start, "Identifier '#" + element.key.name + "' has already been declared");
        }
      }
    }
    this.strict = oldStrict;
    this.next();
    node.body = this.finishNode(classBody, "ClassBody");
    this.exitClassBody();
    return this.finishNode(node, isStatement ? "ClassDeclaration" : "ClassExpression");
  };
  pp$8.parseClassElement = function(constructorAllowsSuper) {
    if (this.eat(types$1.semi)) {
      return null;
    }
    var ecmaVersion = this.options.ecmaVersion;
    var node = this.startNode();
    var keyName = "";
    var isGenerator = false;
    var isAsync = false;
    var kind = "method";
    var isStatic = false;
    if (this.eatContextual("static")) {
      if (ecmaVersion >= 13 && this.eat(types$1.braceL)) {
        this.parseClassStaticBlock(node);
        return node;
      }
      if (this.isClassElementNameStart() || this.type === types$1.star) {
        isStatic = true;
      } else {
        keyName = "static";
      }
    }
    node.static = isStatic;
    if (!keyName && ecmaVersion >= 8 && this.eatContextual("async")) {
      if ((this.isClassElementNameStart() || this.type === types$1.star) && !this.canInsertSemicolon()) {
        isAsync = true;
      } else {
        keyName = "async";
      }
    }
    if (!keyName && (ecmaVersion >= 9 || !isAsync) && this.eat(types$1.star)) {
      isGenerator = true;
    }
    if (!keyName && !isAsync && !isGenerator) {
      var lastValue = this.value;
      if (this.eatContextual("get") || this.eatContextual("set")) {
        if (this.isClassElementNameStart()) {
          kind = lastValue;
        } else {
          keyName = lastValue;
        }
      }
    }
    if (keyName) {
      node.computed = false;
      node.key = this.startNodeAt(this.lastTokStart, this.lastTokStartLoc);
      node.key.name = keyName;
      this.finishNode(node.key, "Identifier");
    } else {
      this.parseClassElementName(node);
    }
    if (ecmaVersion < 13 || this.type === types$1.parenL || kind !== "method" || isGenerator || isAsync) {
      var isConstructor = !node.static && checkKeyName(node, "constructor");
      var allowsDirectSuper = isConstructor && constructorAllowsSuper;
      if (isConstructor && kind !== "method") {
        this.raise(node.key.start, "Constructor can't have get/set modifier");
      }
      node.kind = isConstructor ? "constructor" : kind;
      this.parseClassMethod(node, isGenerator, isAsync, allowsDirectSuper);
    } else {
      this.parseClassField(node);
    }
    return node;
  };
  pp$8.isClassElementNameStart = function() {
    return this.type === types$1.name || this.type === types$1.privateId || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword;
  };
  pp$8.parseClassElementName = function(element) {
    if (this.type === types$1.privateId) {
      if (this.value === "constructor") {
        this.raise(this.start, "Classes can't have an element named '#constructor'");
      }
      element.computed = false;
      element.key = this.parsePrivateIdent();
    } else {
      this.parsePropertyName(element);
    }
  };
  pp$8.parseClassMethod = function(method, isGenerator, isAsync, allowsDirectSuper) {
    var key = method.key;
    if (method.kind === "constructor") {
      if (isGenerator) {
        this.raise(key.start, "Constructor can't be a generator");
      }
      if (isAsync) {
        this.raise(key.start, "Constructor can't be an async method");
      }
    } else if (method.static && checkKeyName(method, "prototype")) {
      this.raise(key.start, "Classes may not have a static property named prototype");
    }
    var value = method.value = this.parseMethod(isGenerator, isAsync, allowsDirectSuper);
    if (method.kind === "get" && value.params.length !== 0) {
      this.raiseRecoverable(value.start, "getter should have no params");
    }
    if (method.kind === "set" && value.params.length !== 1) {
      this.raiseRecoverable(value.start, "setter should have exactly one param");
    }
    if (method.kind === "set" && value.params[0].type === "RestElement") {
      this.raiseRecoverable(value.params[0].start, "Setter cannot use rest params");
    }
    return this.finishNode(method, "MethodDefinition");
  };
  pp$8.parseClassField = function(field) {
    if (checkKeyName(field, "constructor")) {
      this.raise(field.key.start, "Classes can't have a field named 'constructor'");
    } else if (field.static && checkKeyName(field, "prototype")) {
      this.raise(field.key.start, "Classes can't have a static field named 'prototype'");
    }
    if (this.eat(types$1.eq)) {
      this.enterScope(SCOPE_CLASS_FIELD_INIT | SCOPE_SUPER);
      field.value = this.parseMaybeAssign();
      this.exitScope();
    } else {
      field.value = null;
    }
    this.semicolon();
    return this.finishNode(field, "PropertyDefinition");
  };
  pp$8.parseClassStaticBlock = function(node) {
    node.body = [];
    var oldLabels = this.labels;
    this.labels = [];
    this.enterScope(SCOPE_CLASS_STATIC_BLOCK | SCOPE_SUPER);
    while (this.type !== types$1.braceR) {
      var stmt = this.parseStatement(null);
      node.body.push(stmt);
    }
    this.next();
    this.exitScope();
    this.labels = oldLabels;
    return this.finishNode(node, "StaticBlock");
  };
  pp$8.parseClassId = function(node, isStatement) {
    if (this.type === types$1.name) {
      node.id = this.parseIdent();
      if (isStatement) {
        this.checkLValSimple(node.id, BIND_LEXICAL, false);
      }
    } else {
      if (isStatement === true) {
        this.unexpected();
      }
      node.id = null;
    }
  };
  pp$8.parseClassSuper = function(node) {
    node.superClass = this.eat(types$1._extends) ? this.parseExprSubscripts(null, false) : null;
  };
  pp$8.enterClassBody = function() {
    var element = { declared: /* @__PURE__ */ Object.create(null), used: [] };
    this.privateNameStack.push(element);
    return element.declared;
  };
  pp$8.exitClassBody = function() {
    var ref2 = this.privateNameStack.pop();
    var declared = ref2.declared;
    var used = ref2.used;
    if (!this.options.checkPrivateFields) {
      return;
    }
    var len = this.privateNameStack.length;
    var parent = len === 0 ? null : this.privateNameStack[len - 1];
    for (var i = 0; i < used.length; ++i) {
      var id = used[i];
      if (!hasOwn(declared, id.name)) {
        if (parent) {
          parent.used.push(id);
        } else {
          this.raiseRecoverable(id.start, "Private field '#" + id.name + "' must be declared in an enclosing class");
        }
      }
    }
  };
  function isPrivateNameConflicted(privateNameMap, element) {
    var name = element.key.name;
    var curr = privateNameMap[name];
    var next2 = "true";
    if (element.type === "MethodDefinition" && (element.kind === "get" || element.kind === "set")) {
      next2 = (element.static ? "s" : "i") + element.kind;
    }
    if (curr === "iget" && next2 === "iset" || curr === "iset" && next2 === "iget" || curr === "sget" && next2 === "sset" || curr === "sset" && next2 === "sget") {
      privateNameMap[name] = "true";
      return false;
    } else if (!curr) {
      privateNameMap[name] = next2;
      return false;
    } else {
      return true;
    }
  }
  function checkKeyName(node, name) {
    var computed = node.computed;
    var key = node.key;
    return !computed && (key.type === "Identifier" && key.name === name || key.type === "Literal" && key.value === name);
  }
  pp$8.parseExportAllDeclaration = function(node, exports$1) {
    if (this.options.ecmaVersion >= 11) {
      if (this.eatContextual("as")) {
        node.exported = this.parseModuleExportName();
        this.checkExport(exports$1, node.exported, this.lastTokStart);
      } else {
        node.exported = null;
      }
    }
    this.expectContextual("from");
    if (this.type !== types$1.string) {
      this.unexpected();
    }
    node.source = this.parseExprAtom();
    if (this.options.ecmaVersion >= 16) {
      node.attributes = this.parseWithClause();
    }
    this.semicolon();
    return this.finishNode(node, "ExportAllDeclaration");
  };
  pp$8.parseExport = function(node, exports$1) {
    this.next();
    if (this.eat(types$1.star)) {
      return this.parseExportAllDeclaration(node, exports$1);
    }
    if (this.eat(types$1._default)) {
      this.checkExport(exports$1, "default", this.lastTokStart);
      node.declaration = this.parseExportDefaultDeclaration();
      return this.finishNode(node, "ExportDefaultDeclaration");
    }
    if (this.shouldParseExportStatement()) {
      node.declaration = this.parseExportDeclaration(node);
      if (node.declaration.type === "VariableDeclaration") {
        this.checkVariableExport(exports$1, node.declaration.declarations);
      } else {
        this.checkExport(exports$1, node.declaration.id, node.declaration.id.start);
      }
      node.specifiers = [];
      node.source = null;
      if (this.options.ecmaVersion >= 16) {
        node.attributes = [];
      }
    } else {
      node.declaration = null;
      node.specifiers = this.parseExportSpecifiers(exports$1);
      if (this.eatContextual("from")) {
        if (this.type !== types$1.string) {
          this.unexpected();
        }
        node.source = this.parseExprAtom();
        if (this.options.ecmaVersion >= 16) {
          node.attributes = this.parseWithClause();
        }
      } else {
        for (var i = 0, list = node.specifiers; i < list.length; i += 1) {
          var spec = list[i];
          this.checkUnreserved(spec.local);
          this.checkLocalExport(spec.local);
          if (spec.local.type === "Literal") {
            this.raise(spec.local.start, "A string literal cannot be used as an exported binding without `from`.");
          }
        }
        node.source = null;
        if (this.options.ecmaVersion >= 16) {
          node.attributes = [];
        }
      }
      this.semicolon();
    }
    return this.finishNode(node, "ExportNamedDeclaration");
  };
  pp$8.parseExportDeclaration = function(node) {
    return this.parseStatement(null);
  };
  pp$8.parseExportDefaultDeclaration = function() {
    var isAsync;
    if (this.type === types$1._function || (isAsync = this.isAsyncFunction())) {
      var fNode = this.startNode();
      this.next();
      if (isAsync) {
        this.next();
      }
      return this.parseFunction(fNode, FUNC_STATEMENT | FUNC_NULLABLE_ID, false, isAsync);
    } else if (this.type === types$1._class) {
      var cNode = this.startNode();
      return this.parseClass(cNode, "nullableID");
    } else {
      var declaration = this.parseMaybeAssign();
      this.semicolon();
      return declaration;
    }
  };
  pp$8.checkExport = function(exports$1, name, pos) {
    if (!exports$1) {
      return;
    }
    if (typeof name !== "string") {
      name = name.type === "Identifier" ? name.name : name.value;
    }
    if (hasOwn(exports$1, name)) {
      this.raiseRecoverable(pos, "Duplicate export '" + name + "'");
    }
    exports$1[name] = true;
  };
  pp$8.checkPatternExport = function(exports$1, pat) {
    var type = pat.type;
    if (type === "Identifier") {
      this.checkExport(exports$1, pat, pat.start);
    } else if (type === "ObjectPattern") {
      for (var i = 0, list = pat.properties; i < list.length; i += 1) {
        var prop = list[i];
        this.checkPatternExport(exports$1, prop);
      }
    } else if (type === "ArrayPattern") {
      for (var i$1 = 0, list$1 = pat.elements; i$1 < list$1.length; i$1 += 1) {
        var elt = list$1[i$1];
        if (elt) {
          this.checkPatternExport(exports$1, elt);
        }
      }
    } else if (type === "Property") {
      this.checkPatternExport(exports$1, pat.value);
    } else if (type === "AssignmentPattern") {
      this.checkPatternExport(exports$1, pat.left);
    } else if (type === "RestElement") {
      this.checkPatternExport(exports$1, pat.argument);
    }
  };
  pp$8.checkVariableExport = function(exports$1, decls) {
    if (!exports$1) {
      return;
    }
    for (var i = 0, list = decls; i < list.length; i += 1) {
      var decl = list[i];
      this.checkPatternExport(exports$1, decl.id);
    }
  };
  pp$8.shouldParseExportStatement = function() {
    return this.type.keyword === "var" || this.type.keyword === "const" || this.type.keyword === "class" || this.type.keyword === "function" || this.isLet() || this.isAsyncFunction();
  };
  pp$8.parseExportSpecifier = function(exports$1) {
    var node = this.startNode();
    node.local = this.parseModuleExportName();
    node.exported = this.eatContextual("as") ? this.parseModuleExportName() : node.local;
    this.checkExport(
      exports$1,
      node.exported,
      node.exported.start
    );
    return this.finishNode(node, "ExportSpecifier");
  };
  pp$8.parseExportSpecifiers = function(exports$1) {
    var nodes = [], first = true;
    this.expect(types$1.braceL);
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.afterTrailingComma(types$1.braceR)) {
          break;
        }
      } else {
        first = false;
      }
      nodes.push(this.parseExportSpecifier(exports$1));
    }
    return nodes;
  };
  pp$8.parseImport = function(node) {
    this.next();
    if (this.type === types$1.string) {
      node.specifiers = empty$1;
      node.source = this.parseExprAtom();
    } else {
      node.specifiers = this.parseImportSpecifiers();
      this.expectContextual("from");
      node.source = this.type === types$1.string ? this.parseExprAtom() : this.unexpected();
    }
    if (this.options.ecmaVersion >= 16) {
      node.attributes = this.parseWithClause();
    }
    this.semicolon();
    return this.finishNode(node, "ImportDeclaration");
  };
  pp$8.parseImportSpecifier = function() {
    var node = this.startNode();
    node.imported = this.parseModuleExportName();
    if (this.eatContextual("as")) {
      node.local = this.parseIdent();
    } else {
      this.checkUnreserved(node.imported);
      node.local = node.imported;
    }
    this.checkLValSimple(node.local, BIND_LEXICAL);
    return this.finishNode(node, "ImportSpecifier");
  };
  pp$8.parseImportDefaultSpecifier = function() {
    var node = this.startNode();
    node.local = this.parseIdent();
    this.checkLValSimple(node.local, BIND_LEXICAL);
    return this.finishNode(node, "ImportDefaultSpecifier");
  };
  pp$8.parseImportNamespaceSpecifier = function() {
    var node = this.startNode();
    this.next();
    this.expectContextual("as");
    node.local = this.parseIdent();
    this.checkLValSimple(node.local, BIND_LEXICAL);
    return this.finishNode(node, "ImportNamespaceSpecifier");
  };
  pp$8.parseImportSpecifiers = function() {
    var nodes = [], first = true;
    if (this.type === types$1.name) {
      nodes.push(this.parseImportDefaultSpecifier());
      if (!this.eat(types$1.comma)) {
        return nodes;
      }
    }
    if (this.type === types$1.star) {
      nodes.push(this.parseImportNamespaceSpecifier());
      return nodes;
    }
    this.expect(types$1.braceL);
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.afterTrailingComma(types$1.braceR)) {
          break;
        }
      } else {
        first = false;
      }
      nodes.push(this.parseImportSpecifier());
    }
    return nodes;
  };
  pp$8.parseWithClause = function() {
    var nodes = [];
    if (!this.eat(types$1._with)) {
      return nodes;
    }
    this.expect(types$1.braceL);
    var attributeKeys = {};
    var first = true;
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.afterTrailingComma(types$1.braceR)) {
          break;
        }
      } else {
        first = false;
      }
      var attr = this.parseImportAttribute();
      var keyName = attr.key.type === "Identifier" ? attr.key.name : attr.key.value;
      if (hasOwn(attributeKeys, keyName)) {
        this.raiseRecoverable(attr.key.start, "Duplicate attribute key '" + keyName + "'");
      }
      attributeKeys[keyName] = true;
      nodes.push(attr);
    }
    return nodes;
  };
  pp$8.parseImportAttribute = function() {
    var node = this.startNode();
    node.key = this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
    this.expect(types$1.colon);
    if (this.type !== types$1.string) {
      this.unexpected();
    }
    node.value = this.parseExprAtom();
    return this.finishNode(node, "ImportAttribute");
  };
  pp$8.parseModuleExportName = function() {
    if (this.options.ecmaVersion >= 13 && this.type === types$1.string) {
      var stringLiteral = this.parseLiteral(this.value);
      if (loneSurrogate.test(stringLiteral.value)) {
        this.raise(stringLiteral.start, "An export name cannot include a lone surrogate.");
      }
      return stringLiteral;
    }
    return this.parseIdent(true);
  };
  pp$8.adaptDirectivePrologue = function(statements) {
    for (var i = 0; i < statements.length && this.isDirectiveCandidate(statements[i]); ++i) {
      statements[i].directive = statements[i].expression.raw.slice(1, -1);
    }
  };
  pp$8.isDirectiveCandidate = function(statement) {
    return this.options.ecmaVersion >= 5 && statement.type === "ExpressionStatement" && statement.expression.type === "Literal" && typeof statement.expression.value === "string" && // Reject parenthesized strings.
    (this.input[statement.start] === '"' || this.input[statement.start] === "'");
  };
  var pp$7 = Parser.prototype;
  pp$7.toAssignable = function(node, isBinding, refDestructuringErrors) {
    if (this.options.ecmaVersion >= 6 && node) {
      switch (node.type) {
        case "Identifier":
          if (this.inAsync && node.name === "await") {
            this.raise(node.start, "Cannot use 'await' as identifier inside an async function");
          }
          break;
        case "ObjectPattern":
        case "ArrayPattern":
        case "AssignmentPattern":
        case "RestElement":
          break;
        case "ObjectExpression":
          node.type = "ObjectPattern";
          if (refDestructuringErrors) {
            this.checkPatternErrors(refDestructuringErrors, true);
          }
          for (var i = 0, list = node.properties; i < list.length; i += 1) {
            var prop = list[i];
            this.toAssignable(prop, isBinding);
            if (prop.type === "RestElement" && (prop.argument.type === "ArrayPattern" || prop.argument.type === "ObjectPattern")) {
              this.raise(prop.argument.start, "Unexpected token");
            }
          }
          break;
        case "Property":
          if (node.kind !== "init") {
            this.raise(node.key.start, "Object pattern can't contain getter or setter");
          }
          this.toAssignable(node.value, isBinding);
          break;
        case "ArrayExpression":
          node.type = "ArrayPattern";
          if (refDestructuringErrors) {
            this.checkPatternErrors(refDestructuringErrors, true);
          }
          this.toAssignableList(node.elements, isBinding);
          break;
        case "SpreadElement":
          node.type = "RestElement";
          this.toAssignable(node.argument, isBinding);
          if (node.argument.type === "AssignmentPattern") {
            this.raise(node.argument.start, "Rest elements cannot have a default value");
          }
          break;
        case "AssignmentExpression":
          if (node.operator !== "=") {
            this.raise(node.left.end, "Only '=' operator can be used for specifying default value.");
          }
          node.type = "AssignmentPattern";
          delete node.operator;
          this.toAssignable(node.left, isBinding);
          break;
        case "ParenthesizedExpression":
          this.toAssignable(node.expression, isBinding, refDestructuringErrors);
          break;
        case "ChainExpression":
          this.raiseRecoverable(node.start, "Optional chaining cannot appear in left-hand side");
          break;
        case "MemberExpression":
          if (!isBinding) {
            break;
          }
        default:
          this.raise(node.start, "Assigning to rvalue");
      }
    } else if (refDestructuringErrors) {
      this.checkPatternErrors(refDestructuringErrors, true);
    }
    return node;
  };
  pp$7.toAssignableList = function(exprList, isBinding) {
    var end = exprList.length;
    for (var i = 0; i < end; i++) {
      var elt = exprList[i];
      if (elt) {
        this.toAssignable(elt, isBinding);
      }
    }
    if (end) {
      var last = exprList[end - 1];
      if (this.options.ecmaVersion === 6 && isBinding && last && last.type === "RestElement" && last.argument.type !== "Identifier") {
        this.unexpected(last.argument.start);
      }
    }
    return exprList;
  };
  pp$7.parseSpread = function(refDestructuringErrors) {
    var node = this.startNode();
    this.next();
    node.argument = this.parseMaybeAssign(false, refDestructuringErrors);
    return this.finishNode(node, "SpreadElement");
  };
  pp$7.parseRestBinding = function() {
    var node = this.startNode();
    this.next();
    if (this.options.ecmaVersion === 6 && this.type !== types$1.name) {
      this.unexpected();
    }
    node.argument = this.parseBindingAtom();
    return this.finishNode(node, "RestElement");
  };
  pp$7.parseBindingAtom = function() {
    if (this.options.ecmaVersion >= 6) {
      switch (this.type) {
        case types$1.bracketL:
          var node = this.startNode();
          this.next();
          node.elements = this.parseBindingList(types$1.bracketR, true, true);
          return this.finishNode(node, "ArrayPattern");
        case types$1.braceL:
          return this.parseObj(true);
      }
    }
    return this.parseIdent();
  };
  pp$7.parseBindingList = function(close, allowEmpty, allowTrailingComma, allowModifiers) {
    var elts = [], first = true;
    while (!this.eat(close)) {
      if (first) {
        first = false;
      } else {
        this.expect(types$1.comma);
      }
      if (allowEmpty && this.type === types$1.comma) {
        elts.push(null);
      } else if (allowTrailingComma && this.afterTrailingComma(close)) {
        break;
      } else if (this.type === types$1.ellipsis) {
        var rest = this.parseRestBinding();
        this.parseBindingListItem(rest);
        elts.push(rest);
        if (this.type === types$1.comma) {
          this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
        }
        this.expect(close);
        break;
      } else {
        elts.push(this.parseAssignableListItem(allowModifiers));
      }
    }
    return elts;
  };
  pp$7.parseAssignableListItem = function(allowModifiers) {
    var elem = this.parseMaybeDefault(this.start, this.startLoc);
    this.parseBindingListItem(elem);
    return elem;
  };
  pp$7.parseBindingListItem = function(param) {
    return param;
  };
  pp$7.parseMaybeDefault = function(startPos, startLoc, left) {
    left = left || this.parseBindingAtom();
    if (this.options.ecmaVersion < 6 || !this.eat(types$1.eq)) {
      return left;
    }
    var node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.right = this.parseMaybeAssign();
    return this.finishNode(node, "AssignmentPattern");
  };
  pp$7.checkLValSimple = function(expr, bindingType, checkClashes) {
    if (bindingType === void 0) bindingType = BIND_NONE;
    var isBind = bindingType !== BIND_NONE;
    switch (expr.type) {
      case "Identifier":
        if (this.strict && this.reservedWordsStrictBind.test(expr.name)) {
          this.raiseRecoverable(expr.start, (isBind ? "Binding " : "Assigning to ") + expr.name + " in strict mode");
        }
        if (isBind) {
          if (bindingType === BIND_LEXICAL && expr.name === "let") {
            this.raiseRecoverable(expr.start, "let is disallowed as a lexically bound name");
          }
          if (checkClashes) {
            if (hasOwn(checkClashes, expr.name)) {
              this.raiseRecoverable(expr.start, "Argument name clash");
            }
            checkClashes[expr.name] = true;
          }
          if (bindingType !== BIND_OUTSIDE) {
            this.declareName(expr.name, bindingType, expr.start);
          }
        }
        break;
      case "ChainExpression":
        this.raiseRecoverable(expr.start, "Optional chaining cannot appear in left-hand side");
        break;
      case "MemberExpression":
        if (isBind) {
          this.raiseRecoverable(expr.start, "Binding member expression");
        }
        break;
      case "ParenthesizedExpression":
        if (isBind) {
          this.raiseRecoverable(expr.start, "Binding parenthesized expression");
        }
        return this.checkLValSimple(expr.expression, bindingType, checkClashes);
      default:
        this.raise(expr.start, (isBind ? "Binding" : "Assigning to") + " rvalue");
    }
  };
  pp$7.checkLValPattern = function(expr, bindingType, checkClashes) {
    if (bindingType === void 0) bindingType = BIND_NONE;
    switch (expr.type) {
      case "ObjectPattern":
        for (var i = 0, list = expr.properties; i < list.length; i += 1) {
          var prop = list[i];
          this.checkLValInnerPattern(prop, bindingType, checkClashes);
        }
        break;
      case "ArrayPattern":
        for (var i$1 = 0, list$1 = expr.elements; i$1 < list$1.length; i$1 += 1) {
          var elem = list$1[i$1];
          if (elem) {
            this.checkLValInnerPattern(elem, bindingType, checkClashes);
          }
        }
        break;
      default:
        this.checkLValSimple(expr, bindingType, checkClashes);
    }
  };
  pp$7.checkLValInnerPattern = function(expr, bindingType, checkClashes) {
    if (bindingType === void 0) bindingType = BIND_NONE;
    switch (expr.type) {
      case "Property":
        this.checkLValInnerPattern(expr.value, bindingType, checkClashes);
        break;
      case "AssignmentPattern":
        this.checkLValPattern(expr.left, bindingType, checkClashes);
        break;
      case "RestElement":
        this.checkLValPattern(expr.argument, bindingType, checkClashes);
        break;
      default:
        this.checkLValPattern(expr, bindingType, checkClashes);
    }
  };
  var TokContext = function TokContext2(token, isExpr, preserveSpace, override, generator) {
    this.token = token;
    this.isExpr = !!isExpr;
    this.preserveSpace = !!preserveSpace;
    this.override = override;
    this.generator = !!generator;
  };
  var types = {
    b_stat: new TokContext("{", false),
    b_expr: new TokContext("{", true),
    b_tmpl: new TokContext("${", false),
    p_stat: new TokContext("(", false),
    p_expr: new TokContext("(", true),
    q_tmpl: new TokContext("`", true, true, function(p) {
      return p.tryReadTemplateToken();
    }),
    f_stat: new TokContext("function", false),
    f_expr: new TokContext("function", true),
    f_expr_gen: new TokContext("function", true, false, null, true),
    f_gen: new TokContext("function", false, false, null, true)
  };
  var pp$6 = Parser.prototype;
  pp$6.initialContext = function() {
    return [types.b_stat];
  };
  pp$6.curContext = function() {
    return this.context[this.context.length - 1];
  };
  pp$6.braceIsBlock = function(prevType) {
    var parent = this.curContext();
    if (parent === types.f_expr || parent === types.f_stat) {
      return true;
    }
    if (prevType === types$1.colon && (parent === types.b_stat || parent === types.b_expr)) {
      return !parent.isExpr;
    }
    if (prevType === types$1._return || prevType === types$1.name && this.exprAllowed) {
      return lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
    }
    if (prevType === types$1._else || prevType === types$1.semi || prevType === types$1.eof || prevType === types$1.parenR || prevType === types$1.arrow) {
      return true;
    }
    if (prevType === types$1.braceL) {
      return parent === types.b_stat;
    }
    if (prevType === types$1._var || prevType === types$1._const || prevType === types$1.name) {
      return false;
    }
    return !this.exprAllowed;
  };
  pp$6.inGeneratorContext = function() {
    for (var i = this.context.length - 1; i >= 1; i--) {
      var context = this.context[i];
      if (context.token === "function") {
        return context.generator;
      }
    }
    return false;
  };
  pp$6.updateContext = function(prevType) {
    var update, type = this.type;
    if (type.keyword && prevType === types$1.dot) {
      this.exprAllowed = false;
    } else if (update = type.updateContext) {
      update.call(this, prevType);
    } else {
      this.exprAllowed = type.beforeExpr;
    }
  };
  pp$6.overrideContext = function(tokenCtx) {
    if (this.curContext() !== tokenCtx) {
      this.context[this.context.length - 1] = tokenCtx;
    }
  };
  types$1.parenR.updateContext = types$1.braceR.updateContext = function() {
    if (this.context.length === 1) {
      this.exprAllowed = true;
      return;
    }
    var out = this.context.pop();
    if (out === types.b_stat && this.curContext().token === "function") {
      out = this.context.pop();
    }
    this.exprAllowed = !out.isExpr;
  };
  types$1.braceL.updateContext = function(prevType) {
    this.context.push(this.braceIsBlock(prevType) ? types.b_stat : types.b_expr);
    this.exprAllowed = true;
  };
  types$1.dollarBraceL.updateContext = function() {
    this.context.push(types.b_tmpl);
    this.exprAllowed = true;
  };
  types$1.parenL.updateContext = function(prevType) {
    var statementParens = prevType === types$1._if || prevType === types$1._for || prevType === types$1._with || prevType === types$1._while;
    this.context.push(statementParens ? types.p_stat : types.p_expr);
    this.exprAllowed = true;
  };
  types$1.incDec.updateContext = function() {
  };
  types$1._function.updateContext = types$1._class.updateContext = function(prevType) {
    if (prevType.beforeExpr && prevType !== types$1._else && !(prevType === types$1.semi && this.curContext() !== types.p_stat) && !(prevType === types$1._return && lineBreak.test(this.input.slice(this.lastTokEnd, this.start))) && !((prevType === types$1.colon || prevType === types$1.braceL) && this.curContext() === types.b_stat)) {
      this.context.push(types.f_expr);
    } else {
      this.context.push(types.f_stat);
    }
    this.exprAllowed = false;
  };
  types$1.colon.updateContext = function() {
    if (this.curContext().token === "function") {
      this.context.pop();
    }
    this.exprAllowed = true;
  };
  types$1.backQuote.updateContext = function() {
    if (this.curContext() === types.q_tmpl) {
      this.context.pop();
    } else {
      this.context.push(types.q_tmpl);
    }
    this.exprAllowed = false;
  };
  types$1.star.updateContext = function(prevType) {
    if (prevType === types$1._function) {
      var index = this.context.length - 1;
      if (this.context[index] === types.f_expr) {
        this.context[index] = types.f_expr_gen;
      } else {
        this.context[index] = types.f_gen;
      }
    }
    this.exprAllowed = true;
  };
  types$1.name.updateContext = function(prevType) {
    var allowed = false;
    if (this.options.ecmaVersion >= 6 && prevType !== types$1.dot) {
      if (this.value === "of" && !this.exprAllowed || this.value === "yield" && this.inGeneratorContext()) {
        allowed = true;
      }
    }
    this.exprAllowed = allowed;
  };
  var pp$5 = Parser.prototype;
  pp$5.checkPropClash = function(prop, propHash, refDestructuringErrors) {
    if (this.options.ecmaVersion >= 9 && prop.type === "SpreadElement") {
      return;
    }
    if (this.options.ecmaVersion >= 6 && (prop.computed || prop.method || prop.shorthand)) {
      return;
    }
    var key = prop.key;
    var name;
    switch (key.type) {
      case "Identifier":
        name = key.name;
        break;
      case "Literal":
        name = String(key.value);
        break;
      default:
        return;
    }
    var kind = prop.kind;
    if (this.options.ecmaVersion >= 6) {
      if (name === "__proto__" && kind === "init") {
        if (propHash.proto) {
          if (refDestructuringErrors) {
            if (refDestructuringErrors.doubleProto < 0) {
              refDestructuringErrors.doubleProto = key.start;
            }
          } else {
            this.raiseRecoverable(key.start, "Redefinition of __proto__ property");
          }
        }
        propHash.proto = true;
      }
      return;
    }
    name = "$" + name;
    var other = propHash[name];
    if (other) {
      var redefinition;
      if (kind === "init") {
        redefinition = this.strict && other.init || other.get || other.set;
      } else {
        redefinition = other.init || other[kind];
      }
      if (redefinition) {
        this.raiseRecoverable(key.start, "Redefinition of property");
      }
    } else {
      other = propHash[name] = {
        init: false,
        get: false,
        set: false
      };
    }
    other[kind] = true;
  };
  pp$5.parseExpression = function(forInit, refDestructuringErrors) {
    var this$1$1 = this;
    return this.catchStackOverflow(function() {
      var startPos = this$1$1.start, startLoc = this$1$1.startLoc;
      var expr = this$1$1.parseMaybeAssign(forInit, refDestructuringErrors);
      if (this$1$1.type === types$1.comma) {
        var node = this$1$1.startNodeAt(startPos, startLoc);
        node.expressions = [expr];
        while (this$1$1.eat(types$1.comma)) {
          node.expressions.push(this$1$1.parseMaybeAssign(forInit, refDestructuringErrors));
        }
        return this$1$1.finishNode(node, "SequenceExpression");
      }
      return expr;
    });
  };
  pp$5.parseMaybeAssign = function(forInit, refDestructuringErrors, afterLeftParse) {
    if (this.isContextual("yield")) {
      if (this.inGenerator) {
        return this.parseYield(forInit);
      } else {
        this.exprAllowed = false;
      }
    }
    var ownDestructuringErrors = false, oldParenAssign = -1, oldTrailingComma = -1, oldDoubleProto = -1;
    if (refDestructuringErrors) {
      oldParenAssign = refDestructuringErrors.parenthesizedAssign;
      oldTrailingComma = refDestructuringErrors.trailingComma;
      oldDoubleProto = refDestructuringErrors.doubleProto;
      refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = -1;
    } else {
      refDestructuringErrors = new DestructuringErrors();
      ownDestructuringErrors = true;
    }
    var startPos = this.start, startLoc = this.startLoc;
    if (this.type === types$1.parenL || this.type === types$1.name) {
      this.potentialArrowAt = this.start;
      this.potentialArrowInForAwait = forInit === "await";
    }
    var left = this.parseMaybeConditional(forInit, refDestructuringErrors);
    if (afterLeftParse) {
      left = afterLeftParse.call(this, left, startPos, startLoc);
    }
    if (this.type.isAssign) {
      var node = this.startNodeAt(startPos, startLoc);
      node.operator = this.value;
      if (this.type === types$1.eq) {
        left = this.toAssignable(left, false, refDestructuringErrors);
      }
      if (!ownDestructuringErrors) {
        refDestructuringErrors.parenthesizedAssign = refDestructuringErrors.trailingComma = -1;
        if (refDestructuringErrors.shorthandAssign >= left.start) {
          refDestructuringErrors.shorthandAssign = -1;
        }
        if (refDestructuringErrors.doubleProto >= left.start) {
          refDestructuringErrors.doubleProto = -1;
        }
      }
      if (this.type === types$1.eq) {
        this.checkLValPattern(left);
      } else {
        this.checkLValSimple(left);
      }
      node.left = left;
      this.next();
      node.right = this.parseMaybeAssign(forInit);
      if (oldDoubleProto > -1) {
        refDestructuringErrors.doubleProto = oldDoubleProto;
      }
      return this.finishNode(node, "AssignmentExpression");
    } else {
      if (ownDestructuringErrors) {
        this.checkExpressionErrors(refDestructuringErrors, true);
      }
    }
    if (oldParenAssign > -1) {
      refDestructuringErrors.parenthesizedAssign = oldParenAssign;
    }
    if (oldTrailingComma > -1) {
      refDestructuringErrors.trailingComma = oldTrailingComma;
    }
    return left;
  };
  pp$5.parseMaybeConditional = function(forInit, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseExprOps(forInit, refDestructuringErrors);
    if (this.checkExpressionErrors(refDestructuringErrors)) {
      return expr;
    }
    if (!(expr.type === "ArrowFunctionExpression" && expr.start === startPos) && this.eat(types$1.question)) {
      var node = this.startNodeAt(startPos, startLoc);
      node.test = expr;
      node.consequent = this.parseMaybeAssign();
      this.expect(types$1.colon);
      node.alternate = this.parseMaybeAssign(forInit);
      return this.finishNode(node, "ConditionalExpression");
    }
    return expr;
  };
  pp$5.parseExprOps = function(forInit, refDestructuringErrors) {
    var startPos = this.start, startLoc = this.startLoc;
    var expr = this.parseMaybeUnary(refDestructuringErrors, false, false, forInit);
    if (this.checkExpressionErrors(refDestructuringErrors)) {
      return expr;
    }
    return expr.start === startPos && expr.type === "ArrowFunctionExpression" ? expr : this.parseExprOp(expr, startPos, startLoc, -1, forInit);
  };
  pp$5.parseExprOp = function(left, leftStartPos, leftStartLoc, minPrec, forInit) {
    var prec = this.type.binop;
    if (prec != null && (!forInit || this.type !== types$1._in)) {
      if (prec > minPrec) {
        var logical = this.type === types$1.logicalOR || this.type === types$1.logicalAND;
        var coalesce = this.type === types$1.coalesce;
        if (coalesce) {
          prec = types$1.logicalAND.binop;
        }
        var op = this.value;
        this.next();
        var startPos = this.start, startLoc = this.startLoc;
        var right = this.parseExprOp(this.parseMaybeUnary(null, false, false, forInit), startPos, startLoc, prec, forInit);
        var node = this.buildBinary(leftStartPos, leftStartLoc, left, right, op, logical || coalesce);
        if (logical && this.type === types$1.coalesce || coalesce && (this.type === types$1.logicalOR || this.type === types$1.logicalAND)) {
          this.raiseRecoverable(this.start, "Logical expressions and coalesce expressions cannot be mixed. Wrap either by parentheses");
        }
        return this.parseExprOp(node, leftStartPos, leftStartLoc, minPrec, forInit);
      }
    }
    return left;
  };
  pp$5.buildBinary = function(startPos, startLoc, left, right, op, logical) {
    if (right.type === "PrivateIdentifier") {
      this.raise(right.start, "Private identifier can only be left side of binary expression");
    }
    var node = this.startNodeAt(startPos, startLoc);
    node.left = left;
    node.operator = op;
    node.right = right;
    return this.finishNode(node, logical ? "LogicalExpression" : "BinaryExpression");
  };
  pp$5.parseMaybeUnary = function(refDestructuringErrors, sawUnary, incDec, forInit) {
    var startPos = this.start, startLoc = this.startLoc, expr;
    if (this.isContextual("await") && this.canAwait) {
      expr = this.parseAwait(forInit);
      sawUnary = true;
    } else if (this.type.prefix) {
      var node = this.startNode(), update = this.type === types$1.incDec;
      node.operator = this.value;
      node.prefix = true;
      this.next();
      node.argument = this.parseMaybeUnary(null, true, update, forInit);
      this.checkExpressionErrors(refDestructuringErrors, true);
      if (update) {
        this.checkLValSimple(node.argument);
      } else if (this.strict && node.operator === "delete" && isLocalVariableAccess(node.argument)) {
        this.raiseRecoverable(node.start, "Deleting local variable in strict mode");
      } else if (node.operator === "delete" && isPrivateFieldAccess(node.argument)) {
        this.raiseRecoverable(node.start, "Private fields can not be deleted");
      } else {
        sawUnary = true;
      }
      expr = this.finishNode(node, update ? "UpdateExpression" : "UnaryExpression");
    } else if (!sawUnary && this.type === types$1.privateId) {
      if ((forInit || this.privateNameStack.length === 0) && this.options.checkPrivateFields) {
        this.unexpected();
      }
      expr = this.parsePrivateIdent();
      if (this.type !== types$1._in) {
        this.unexpected();
      }
    } else {
      expr = this.parseExprSubscripts(refDestructuringErrors, forInit);
      if (this.checkExpressionErrors(refDestructuringErrors)) {
        return expr;
      }
      while (this.type.postfix && !this.canInsertSemicolon()) {
        var node$1 = this.startNodeAt(startPos, startLoc);
        node$1.operator = this.value;
        node$1.prefix = false;
        node$1.argument = expr;
        this.checkLValSimple(expr);
        this.next();
        expr = this.finishNode(node$1, "UpdateExpression");
      }
    }
    if (!incDec && !(expr.type === "ArrowFunctionExpression" && expr.start === startPos) && this.eat(types$1.starstar)) {
      if (sawUnary) {
        this.unexpected(this.lastTokStart);
      } else {
        return this.buildBinary(startPos, startLoc, expr, this.parseMaybeUnary(null, false, false, forInit), "**", false);
      }
    } else {
      return expr;
    }
  };
  function isLocalVariableAccess(node) {
    return node.type === "Identifier" || node.type === "ParenthesizedExpression" && isLocalVariableAccess(node.expression);
  }
  function isPrivateFieldAccess(node) {
    return node.type === "MemberExpression" && node.property.type === "PrivateIdentifier" || node.type === "ChainExpression" && isPrivateFieldAccess(node.expression) || node.type === "ParenthesizedExpression" && isPrivateFieldAccess(node.expression);
  }
  pp$5.parseExprSubscripts = function(refDestructuringErrors, forInit) {
    var startPos = this.start, startLoc = this.startLoc;
    var oldDoubleProto = -1, oldShorthandAssign = -1;
    if (refDestructuringErrors) {
      oldDoubleProto = refDestructuringErrors.doubleProto;
      oldShorthandAssign = refDestructuringErrors.shorthandAssign;
      refDestructuringErrors.doubleProto = refDestructuringErrors.shorthandAssign = -1;
    }
    var expr = this.parseExprAtom(refDestructuringErrors, forInit);
    if (expr.type === "ArrowFunctionExpression" && this.input.slice(this.lastTokStart, this.lastTokEnd) !== ")") {
      return expr;
    }
    var result = this.parseSubscripts(expr, startPos, startLoc, false, forInit);
    if (refDestructuringErrors) {
      if (result.end > expr.end) {
        this.checkExpressionErrors(refDestructuringErrors, true);
        if (refDestructuringErrors.parenthesizedAssign >= result.start) {
          refDestructuringErrors.parenthesizedAssign = -1;
        }
        if (refDestructuringErrors.parenthesizedBind >= result.start) {
          refDestructuringErrors.parenthesizedBind = -1;
        }
        if (refDestructuringErrors.trailingComma >= result.start) {
          refDestructuringErrors.trailingComma = -1;
        }
      }
      if (oldDoubleProto > -1) {
        refDestructuringErrors.doubleProto = oldDoubleProto;
      }
      if (oldShorthandAssign > -1) {
        refDestructuringErrors.shorthandAssign = oldShorthandAssign;
      }
    }
    return result;
  };
  pp$5.parseSubscripts = function(base, startPos, startLoc, noCalls, forInit) {
    var maybeAsyncArrow = this.options.ecmaVersion >= 8 && base.type === "Identifier" && base.name === "async" && this.lastTokEnd === base.end && !this.canInsertSemicolon() && base.end - base.start === 5 && this.potentialArrowAt === base.start;
    var optionalChained = false;
    while (true) {
      var element = this.parseSubscript(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit);
      if (element.optional) {
        optionalChained = true;
      }
      if (element.end === base.end || element.type === "ArrowFunctionExpression") {
        if (optionalChained) {
          var chainNode = this.startNodeAt(startPos, startLoc);
          chainNode.expression = element;
          element = this.finishNode(chainNode, "ChainExpression");
        }
        return element;
      }
      base = element;
      maybeAsyncArrow = false;
    }
  };
  pp$5.shouldParseAsyncArrow = function() {
    return !this.canInsertSemicolon() && this.eat(types$1.arrow);
  };
  pp$5.parseSubscriptAsyncArrow = function(startPos, startLoc, exprList, forInit) {
    return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, true, forInit);
  };
  pp$5.parseSubscript = function(base, startPos, startLoc, noCalls, maybeAsyncArrow, optionalChained, forInit) {
    var optionalSupported = this.options.ecmaVersion >= 11;
    var optional = optionalSupported && this.eat(types$1.questionDot);
    if (noCalls && optional) {
      this.raise(this.lastTokStart, "Optional chaining cannot appear in the callee of new expressions");
    }
    var computed = this.eat(types$1.bracketL);
    if (computed || optional && this.type !== types$1.parenL && this.type !== types$1.backQuote || this.eat(types$1.dot)) {
      var node = this.startNodeAt(startPos, startLoc);
      node.object = base;
      if (computed) {
        node.property = this.parseExpression();
        this.expect(types$1.bracketR);
      } else if (this.type === types$1.privateId && base.type !== "Super") {
        node.property = this.parsePrivateIdent();
      } else {
        node.property = this.parseIdent(this.options.allowReserved !== "never");
      }
      node.computed = !!computed;
      if (optionalSupported) {
        node.optional = optional;
      }
      base = this.finishNode(node, "MemberExpression");
    } else if (!noCalls && this.eat(types$1.parenL)) {
      var refDestructuringErrors = new DestructuringErrors(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
      this.yieldPos = 0;
      this.awaitPos = 0;
      this.awaitIdentPos = 0;
      var exprList = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false, refDestructuringErrors);
      if (maybeAsyncArrow && !optional && this.shouldParseAsyncArrow()) {
        this.checkPatternErrors(refDestructuringErrors, false);
        this.checkYieldAwaitInDefaultParams();
        if (this.awaitIdentPos > 0) {
          this.raise(this.awaitIdentPos, "Cannot use 'await' as identifier inside an async function");
        }
        this.yieldPos = oldYieldPos;
        this.awaitPos = oldAwaitPos;
        this.awaitIdentPos = oldAwaitIdentPos;
        return this.parseSubscriptAsyncArrow(startPos, startLoc, exprList, forInit);
      }
      this.checkExpressionErrors(refDestructuringErrors, true);
      this.yieldPos = oldYieldPos || this.yieldPos;
      this.awaitPos = oldAwaitPos || this.awaitPos;
      this.awaitIdentPos = oldAwaitIdentPos || this.awaitIdentPos;
      var node$1 = this.startNodeAt(startPos, startLoc);
      node$1.callee = base;
      node$1.arguments = exprList;
      if (optionalSupported) {
        node$1.optional = optional;
      }
      base = this.finishNode(node$1, "CallExpression");
    } else if (this.type === types$1.backQuote) {
      if (optional || optionalChained) {
        this.raise(this.start, "Optional chaining cannot appear in the tag of tagged template expressions");
      }
      var node$2 = this.startNodeAt(startPos, startLoc);
      node$2.tag = base;
      node$2.quasi = this.parseTemplate({ isTagged: true });
      base = this.finishNode(node$2, "TaggedTemplateExpression");
    }
    return base;
  };
  pp$5.parseExprAtom = function(refDestructuringErrors, forInit, forNew) {
    if (this.type === types$1.slash) {
      this.readRegexp();
    }
    var node, canBeArrow = this.potentialArrowAt === this.start;
    switch (this.type) {
      case types$1._super:
        if (!this.allowSuper) {
          this.raise(this.start, "'super' keyword outside a method");
        }
        node = this.startNode();
        this.next();
        if (this.type === types$1.parenL && !this.allowDirectSuper) {
          this.raise(node.start, "super() call outside constructor of a subclass");
        }
        if (this.type !== types$1.dot && this.type !== types$1.bracketL && this.type !== types$1.parenL) {
          this.unexpected();
        }
        return this.finishNode(node, "Super");
      case types$1._this:
        node = this.startNode();
        this.next();
        return this.finishNode(node, "ThisExpression");
      case types$1.name:
        var startPos = this.start, startLoc = this.startLoc, containsEsc = this.containsEsc;
        var id = this.parseIdent(false);
        if (this.options.ecmaVersion >= 8 && !containsEsc && id.name === "async" && !this.canInsertSemicolon() && this.eat(types$1._function)) {
          this.overrideContext(types.f_expr);
          return this.parseFunction(this.startNodeAt(startPos, startLoc), 0, false, true, forInit);
        }
        if (canBeArrow && !this.canInsertSemicolon()) {
          if (this.eat(types$1.arrow)) {
            return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], false, forInit);
          }
          if (this.options.ecmaVersion >= 8 && id.name === "async" && this.type === types$1.name && !containsEsc && (!this.potentialArrowInForAwait || this.value !== "of" || this.containsEsc)) {
            id = this.parseIdent(false);
            if (this.canInsertSemicolon() || !this.eat(types$1.arrow)) {
              this.unexpected();
            }
            return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), [id], true, forInit);
          }
        }
        return id;
      case types$1.regexp:
        var value = this.value;
        node = this.parseLiteral(value.value);
        node.regex = { pattern: value.pattern, flags: value.flags };
        return node;
      case types$1.num:
      case types$1.string:
        return this.parseLiteral(this.value);
      case types$1._null:
      case types$1._true:
      case types$1._false:
        node = this.startNode();
        node.value = this.type === types$1._null ? null : this.type === types$1._true;
        node.raw = this.type.keyword;
        this.next();
        return this.finishNode(node, "Literal");
      case types$1.parenL:
        var start = this.start, expr = this.parseParenAndDistinguishExpression(canBeArrow, forInit);
        if (refDestructuringErrors) {
          if (refDestructuringErrors.parenthesizedAssign < 0 && !this.isSimpleAssignTarget(expr)) {
            refDestructuringErrors.parenthesizedAssign = start;
          }
          if (refDestructuringErrors.parenthesizedBind < 0) {
            refDestructuringErrors.parenthesizedBind = start;
          }
        }
        return expr;
      case types$1.bracketL:
        node = this.startNode();
        this.next();
        node.elements = this.parseExprList(types$1.bracketR, true, true, refDestructuringErrors);
        return this.finishNode(node, "ArrayExpression");
      case types$1.braceL:
        this.overrideContext(types.b_expr);
        return this.parseObj(false, refDestructuringErrors);
      case types$1._function:
        node = this.startNode();
        this.next();
        return this.parseFunction(node, 0);
      case types$1._class:
        return this.parseClass(this.startNode(), false);
      case types$1._new:
        return this.parseNew();
      case types$1.backQuote:
        return this.parseTemplate();
      case types$1._import:
        if (this.options.ecmaVersion >= 11) {
          return this.parseExprImport(forNew);
        } else {
          return this.unexpected();
        }
      default:
        return this.parseExprAtomDefault();
    }
  };
  pp$5.parseExprAtomDefault = function() {
    this.unexpected();
  };
  pp$5.parseExprImport = function(forNew) {
    var node = this.startNode();
    if (this.containsEsc) {
      this.raiseRecoverable(this.start, "Escape sequence in keyword import");
    }
    this.next();
    if (this.type === types$1.parenL && !forNew) {
      return this.parseDynamicImport(node);
    } else if (this.type === types$1.dot) {
      var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
      meta.name = "import";
      node.meta = this.finishNode(meta, "Identifier");
      return this.parseImportMeta(node);
    } else {
      this.unexpected();
    }
  };
  pp$5.parseDynamicImport = function(node) {
    this.next();
    node.source = this.parseMaybeAssign();
    if (this.options.ecmaVersion >= 16) {
      if (!this.eat(types$1.parenR)) {
        this.expect(types$1.comma);
        if (!this.afterTrailingComma(types$1.parenR)) {
          node.options = this.parseMaybeAssign();
          if (!this.eat(types$1.parenR)) {
            this.expect(types$1.comma);
            if (!this.afterTrailingComma(types$1.parenR)) {
              this.unexpected();
            }
          }
        } else {
          node.options = null;
        }
      } else {
        node.options = null;
      }
    } else {
      if (!this.eat(types$1.parenR)) {
        var errorPos = this.start;
        if (this.eat(types$1.comma) && this.eat(types$1.parenR)) {
          this.raiseRecoverable(errorPos, "Trailing comma is not allowed in import()");
        } else {
          this.unexpected(errorPos);
        }
      }
    }
    return this.finishNode(node, "ImportExpression");
  };
  pp$5.parseImportMeta = function(node) {
    this.next();
    var containsEsc = this.containsEsc;
    node.property = this.parseIdent(true);
    if (node.property.name !== "meta") {
      this.raiseRecoverable(node.property.start, "The only valid meta property for import is 'import.meta'");
    }
    if (containsEsc) {
      this.raiseRecoverable(node.start, "'import.meta' must not contain escaped characters");
    }
    if (this.options.sourceType !== "module" && !this.options.allowImportExportEverywhere) {
      this.raiseRecoverable(node.start, "Cannot use 'import.meta' outside a module");
    }
    return this.finishNode(node, "MetaProperty");
  };
  pp$5.parseLiteral = function(value) {
    var node = this.startNode();
    node.value = value;
    node.raw = this.input.slice(this.start, this.end);
    if (node.raw.charCodeAt(node.raw.length - 1) === 110) {
      node.bigint = node.value != null ? node.value.toString() : node.raw.slice(0, -1).replace(/_/g, "");
    }
    this.next();
    return this.finishNode(node, "Literal");
  };
  pp$5.parseParenExpression = function() {
    this.expect(types$1.parenL);
    var val = this.parseExpression();
    this.expect(types$1.parenR);
    return val;
  };
  pp$5.shouldParseArrow = function(exprList) {
    return !this.canInsertSemicolon();
  };
  pp$5.parseParenAndDistinguishExpression = function(canBeArrow, forInit) {
    var startPos = this.start, startLoc = this.startLoc, val, allowTrailingComma = this.options.ecmaVersion >= 8;
    if (this.options.ecmaVersion >= 6) {
      this.next();
      var innerStartPos = this.start, innerStartLoc = this.startLoc;
      var exprList = [], first = true, lastIsComma = false;
      var refDestructuringErrors = new DestructuringErrors(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, spreadStart;
      this.yieldPos = 0;
      this.awaitPos = 0;
      while (this.type !== types$1.parenR) {
        first ? first = false : this.expect(types$1.comma);
        if (allowTrailingComma && this.afterTrailingComma(types$1.parenR, true)) {
          lastIsComma = true;
          break;
        } else if (this.type === types$1.ellipsis) {
          spreadStart = this.start;
          exprList.push(this.parseParenItem(this.parseRestBinding()));
          if (this.type === types$1.comma) {
            this.raiseRecoverable(
              this.start,
              "Comma is not permitted after the rest element"
            );
          }
          break;
        } else {
          exprList.push(this.parseMaybeAssign(false, refDestructuringErrors, this.parseParenItem));
        }
      }
      var innerEndPos = this.lastTokEnd, innerEndLoc = this.lastTokEndLoc;
      this.expect(types$1.parenR);
      if (canBeArrow && this.shouldParseArrow(exprList) && this.eat(types$1.arrow)) {
        this.checkPatternErrors(refDestructuringErrors, false);
        this.checkYieldAwaitInDefaultParams();
        this.yieldPos = oldYieldPos;
        this.awaitPos = oldAwaitPos;
        return this.parseParenArrowList(startPos, startLoc, exprList, forInit);
      }
      if (!exprList.length || lastIsComma) {
        this.unexpected(this.lastTokStart);
      }
      if (spreadStart) {
        this.unexpected(spreadStart);
      }
      this.checkExpressionErrors(refDestructuringErrors, true);
      this.yieldPos = oldYieldPos || this.yieldPos;
      this.awaitPos = oldAwaitPos || this.awaitPos;
      if (exprList.length > 1) {
        val = this.startNodeAt(innerStartPos, innerStartLoc);
        val.expressions = exprList;
        this.finishNodeAt(val, "SequenceExpression", innerEndPos, innerEndLoc);
      } else {
        val = exprList[0];
      }
    } else {
      val = this.parseParenExpression();
    }
    if (this.options.preserveParens) {
      var par = this.startNodeAt(startPos, startLoc);
      par.expression = val;
      return this.finishNode(par, "ParenthesizedExpression");
    } else {
      return val;
    }
  };
  pp$5.parseParenItem = function(item) {
    return item;
  };
  pp$5.parseParenArrowList = function(startPos, startLoc, exprList, forInit) {
    return this.parseArrowExpression(this.startNodeAt(startPos, startLoc), exprList, false, forInit);
  };
  var empty = [];
  pp$5.parseNew = function() {
    if (this.containsEsc) {
      this.raiseRecoverable(this.start, "Escape sequence in keyword new");
    }
    var node = this.startNode();
    this.next();
    if (this.options.ecmaVersion >= 6 && this.type === types$1.dot) {
      var meta = this.startNodeAt(node.start, node.loc && node.loc.start);
      meta.name = "new";
      node.meta = this.finishNode(meta, "Identifier");
      this.next();
      var containsEsc = this.containsEsc;
      node.property = this.parseIdent(true);
      if (node.property.name !== "target") {
        this.raiseRecoverable(node.property.start, "The only valid meta property for new is 'new.target'");
      }
      if (containsEsc) {
        this.raiseRecoverable(node.start, "'new.target' must not contain escaped characters");
      }
      if (!this.allowNewDotTarget) {
        this.raiseRecoverable(node.start, "'new.target' can only be used in functions and class static block");
      }
      return this.finishNode(node, "MetaProperty");
    }
    var startPos = this.start, startLoc = this.startLoc;
    node.callee = this.parseSubscripts(this.parseExprAtom(null, false, true), startPos, startLoc, true, false);
    if (node.callee.type === "Super") {
      this.raiseRecoverable(startPos, "Invalid use of 'super'");
    }
    if (this.eat(types$1.parenL)) {
      node.arguments = this.parseExprList(types$1.parenR, this.options.ecmaVersion >= 8, false);
    } else {
      node.arguments = empty;
    }
    return this.finishNode(node, "NewExpression");
  };
  pp$5.parseTemplateElement = function(ref2) {
    var isTagged = ref2.isTagged;
    var elem = this.startNode();
    if (this.type === types$1.invalidTemplate) {
      if (!isTagged) {
        this.raiseRecoverable(this.start, "Bad escape sequence in untagged template literal");
      }
      elem.value = {
        raw: this.value.replace(/\r\n?/g, "\n"),
        cooked: null
      };
    } else {
      elem.value = {
        raw: this.input.slice(this.start, this.end).replace(/\r\n?/g, "\n"),
        cooked: this.value
      };
    }
    this.next();
    elem.tail = this.type === types$1.backQuote;
    return this.finishNode(elem, "TemplateElement");
  };
  pp$5.parseTemplate = function(ref2) {
    if (ref2 === void 0) ref2 = {};
    var isTagged = ref2.isTagged;
    if (isTagged === void 0) isTagged = false;
    var node = this.startNode();
    this.next();
    node.expressions = [];
    var curElt = this.parseTemplateElement({ isTagged });
    node.quasis = [curElt];
    while (!curElt.tail) {
      if (this.type === types$1.eof) {
        this.raise(this.pos, "Unterminated template literal");
      }
      this.expect(types$1.dollarBraceL);
      node.expressions.push(this.parseExpression());
      this.expect(types$1.braceR);
      node.quasis.push(curElt = this.parseTemplateElement({ isTagged }));
    }
    this.next();
    return this.finishNode(node, "TemplateLiteral");
  };
  pp$5.isAsyncProp = function(prop) {
    return !prop.computed && prop.key.type === "Identifier" && prop.key.name === "async" && (this.type === types$1.name || this.type === types$1.num || this.type === types$1.string || this.type === types$1.bracketL || this.type.keyword || this.options.ecmaVersion >= 9 && this.type === types$1.star) && !lineBreak.test(this.input.slice(this.lastTokEnd, this.start));
  };
  pp$5.parseObj = function(isPattern, refDestructuringErrors) {
    var node = this.startNode(), first = true, propHash = {};
    node.properties = [];
    this.next();
    while (!this.eat(types$1.braceR)) {
      if (!first) {
        this.expect(types$1.comma);
        if (this.options.ecmaVersion >= 5 && this.afterTrailingComma(types$1.braceR)) {
          break;
        }
      } else {
        first = false;
      }
      var prop = this.parseProperty(isPattern, refDestructuringErrors);
      if (!isPattern) {
        this.checkPropClash(prop, propHash, refDestructuringErrors);
      }
      node.properties.push(prop);
    }
    return this.finishNode(node, isPattern ? "ObjectPattern" : "ObjectExpression");
  };
  pp$5.parseProperty = function(isPattern, refDestructuringErrors) {
    var prop = this.startNode(), isGenerator, isAsync, startPos, startLoc;
    if (this.options.ecmaVersion >= 9 && this.eat(types$1.ellipsis)) {
      if (isPattern) {
        prop.argument = this.parseIdent(false);
        if (this.type === types$1.comma) {
          this.raiseRecoverable(this.start, "Comma is not permitted after the rest element");
        }
        return this.finishNode(prop, "RestElement");
      }
      prop.argument = this.parseMaybeAssign(false, refDestructuringErrors);
      if (this.type === types$1.comma && refDestructuringErrors && refDestructuringErrors.trailingComma < 0) {
        refDestructuringErrors.trailingComma = this.start;
      }
      return this.finishNode(prop, "SpreadElement");
    }
    if (this.options.ecmaVersion >= 6) {
      prop.method = false;
      prop.shorthand = false;
      if (isPattern || refDestructuringErrors) {
        startPos = this.start;
        startLoc = this.startLoc;
      }
      if (!isPattern) {
        isGenerator = this.eat(types$1.star);
      }
    }
    var containsEsc = this.containsEsc;
    this.parsePropertyName(prop);
    if (!isPattern && !containsEsc && this.options.ecmaVersion >= 8 && !isGenerator && this.isAsyncProp(prop)) {
      isAsync = true;
      isGenerator = this.options.ecmaVersion >= 9 && this.eat(types$1.star);
      this.parsePropertyName(prop);
    } else {
      isAsync = false;
    }
    this.parsePropertyValue(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc);
    return this.finishNode(prop, "Property");
  };
  pp$5.parseGetterSetter = function(prop) {
    var kind = prop.key.name;
    this.parsePropertyName(prop);
    prop.value = this.parseMethod(false);
    prop.kind = kind;
    var paramCount = prop.kind === "get" ? 0 : 1;
    if (prop.value.params.length !== paramCount) {
      var start = prop.value.start;
      if (prop.kind === "get") {
        this.raiseRecoverable(start, "getter should have no params");
      } else {
        this.raiseRecoverable(start, "setter should have exactly one param");
      }
    } else {
      if (prop.kind === "set" && prop.value.params[0].type === "RestElement") {
        this.raiseRecoverable(prop.value.params[0].start, "Setter cannot use rest params");
      }
    }
  };
  pp$5.parsePropertyValue = function(prop, isPattern, isGenerator, isAsync, startPos, startLoc, refDestructuringErrors, containsEsc) {
    if ((isGenerator || isAsync) && this.type === types$1.colon) {
      this.unexpected();
    }
    if (this.eat(types$1.colon)) {
      prop.value = isPattern ? this.parseMaybeDefault(this.start, this.startLoc) : this.parseMaybeAssign(false, refDestructuringErrors);
      prop.kind = "init";
    } else if (this.options.ecmaVersion >= 6 && this.type === types$1.parenL) {
      if (isPattern) {
        this.unexpected();
      }
      prop.method = true;
      prop.value = this.parseMethod(isGenerator, isAsync);
      prop.kind = "init";
    } else if (!isPattern && !containsEsc && this.options.ecmaVersion >= 5 && !prop.computed && prop.key.type === "Identifier" && (prop.key.name === "get" || prop.key.name === "set") && (this.type !== types$1.comma && this.type !== types$1.braceR && this.type !== types$1.eq)) {
      if (isGenerator || isAsync) {
        this.unexpected();
      }
      this.parseGetterSetter(prop);
    } else if (this.options.ecmaVersion >= 6 && !prop.computed && prop.key.type === "Identifier") {
      if (isGenerator || isAsync) {
        this.unexpected();
      }
      this.checkUnreserved(prop.key);
      if (prop.key.name === "await" && !this.awaitIdentPos) {
        this.awaitIdentPos = startPos;
      }
      if (isPattern) {
        prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
      } else if (this.type === types$1.eq && refDestructuringErrors) {
        if (refDestructuringErrors.shorthandAssign < 0) {
          refDestructuringErrors.shorthandAssign = this.start;
        }
        prop.value = this.parseMaybeDefault(startPos, startLoc, this.copyNode(prop.key));
      } else {
        prop.value = this.copyNode(prop.key);
      }
      prop.kind = "init";
      prop.shorthand = true;
    } else {
      this.unexpected();
    }
  };
  pp$5.parsePropertyName = function(prop) {
    if (this.options.ecmaVersion >= 6) {
      if (this.eat(types$1.bracketL)) {
        prop.computed = true;
        prop.key = this.parseMaybeAssign();
        this.expect(types$1.bracketR);
        return prop.key;
      } else {
        prop.computed = false;
      }
    }
    return prop.key = this.type === types$1.num || this.type === types$1.string ? this.parseExprAtom() : this.parseIdent(this.options.allowReserved !== "never");
  };
  pp$5.initFunction = function(node) {
    node.id = null;
    if (this.options.ecmaVersion >= 6) {
      node.generator = node.expression = false;
    }
    if (this.options.ecmaVersion >= 8) {
      node.async = false;
    }
  };
  pp$5.parseMethod = function(isGenerator, isAsync, allowDirectSuper) {
    var node = this.startNode(), oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.initFunction(node);
    if (this.options.ecmaVersion >= 6) {
      node.generator = isGenerator;
    }
    if (this.options.ecmaVersion >= 8) {
      node.async = !!isAsync;
    }
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    this.enterScope(functionFlags(isAsync, node.generator) | SCOPE_SUPER | (allowDirectSuper ? SCOPE_DIRECT_SUPER : 0));
    this.expect(types$1.parenL);
    node.params = this.parseBindingList(types$1.parenR, false, this.options.ecmaVersion >= 8);
    this.checkYieldAwaitInDefaultParams();
    this.parseFunctionBody(node, false, true, false);
    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, "FunctionExpression");
  };
  pp$5.parseArrowExpression = function(node, params, isAsync, forInit) {
    var oldYieldPos = this.yieldPos, oldAwaitPos = this.awaitPos, oldAwaitIdentPos = this.awaitIdentPos;
    this.enterScope(functionFlags(isAsync, false) | SCOPE_ARROW);
    this.initFunction(node);
    if (this.options.ecmaVersion >= 8) {
      node.async = !!isAsync;
    }
    this.yieldPos = 0;
    this.awaitPos = 0;
    this.awaitIdentPos = 0;
    node.params = this.toAssignableList(params, true);
    this.parseFunctionBody(node, true, false, forInit);
    this.yieldPos = oldYieldPos;
    this.awaitPos = oldAwaitPos;
    this.awaitIdentPos = oldAwaitIdentPos;
    return this.finishNode(node, "ArrowFunctionExpression");
  };
  pp$5.parseFunctionBody = function(node, isArrowFunction, isMethod, forInit) {
    var isExpression = isArrowFunction && this.type !== types$1.braceL;
    var oldStrict = this.strict, useStrict = false;
    if (isExpression) {
      node.body = this.parseMaybeAssign(forInit);
      node.expression = true;
      this.checkParams(node, false);
    } else {
      var nonSimple = this.options.ecmaVersion >= 7 && !this.isSimpleParamList(node.params);
      if (!oldStrict || nonSimple) {
        useStrict = this.strictDirective(this.end);
        if (useStrict && nonSimple) {
          this.raiseRecoverable(node.start, "Illegal 'use strict' directive in function with non-simple parameter list");
        }
      }
      var oldLabels = this.labels;
      this.labels = [];
      if (useStrict) {
        this.strict = true;
      }
      this.checkParams(node, !oldStrict && !useStrict && !isArrowFunction && !isMethod && this.isSimpleParamList(node.params));
      if (this.strict && node.id) {
        this.checkLValSimple(node.id, BIND_OUTSIDE);
      }
      node.body = this.parseBlock(false, void 0, useStrict && !oldStrict);
      node.expression = false;
      this.adaptDirectivePrologue(node.body.body);
      this.labels = oldLabels;
    }
    this.exitScope();
  };
  pp$5.isSimpleParamList = function(params) {
    for (var i = 0, list = params; i < list.length; i += 1) {
      var param = list[i];
      if (param.type !== "Identifier") {
        return false;
      }
    }
    return true;
  };
  pp$5.checkParams = function(node, allowDuplicates) {
    var nameHash = /* @__PURE__ */ Object.create(null);
    for (var i = 0, list = node.params; i < list.length; i += 1) {
      var param = list[i];
      this.checkLValInnerPattern(param, BIND_VAR, allowDuplicates ? null : nameHash);
    }
  };
  pp$5.parseExprList = function(close, allowTrailingComma, allowEmpty, refDestructuringErrors) {
    var elts = [], first = true;
    while (!this.eat(close)) {
      if (!first) {
        this.expect(types$1.comma);
        if (allowTrailingComma && this.afterTrailingComma(close)) {
          break;
        }
      } else {
        first = false;
      }
      var elt = void 0;
      if (allowEmpty && this.type === types$1.comma) {
        elt = null;
      } else if (this.type === types$1.ellipsis) {
        elt = this.parseSpread(refDestructuringErrors);
        if (refDestructuringErrors && this.type === types$1.comma && refDestructuringErrors.trailingComma < 0) {
          refDestructuringErrors.trailingComma = this.start;
        }
      } else {
        elt = this.parseMaybeAssign(false, refDestructuringErrors);
      }
      elts.push(elt);
    }
    return elts;
  };
  pp$5.checkUnreserved = function(ref2) {
    var start = ref2.start;
    var end = ref2.end;
    var name = ref2.name;
    if (this.inGenerator && name === "yield") {
      this.raiseRecoverable(start, "Cannot use 'yield' as identifier inside a generator");
    }
    if (this.inAsync && name === "await") {
      this.raiseRecoverable(start, "Cannot use 'await' as identifier inside an async function");
    }
    if (!(this.currentThisScope().flags & SCOPE_VAR) && name === "arguments") {
      this.raiseRecoverable(start, "Cannot use 'arguments' in class field initializer");
    }
    if (this.inClassStaticBlock && (name === "arguments" || name === "await")) {
      this.raise(start, "Cannot use " + name + " in class static initialization block");
    }
    if (this.keywords.test(name)) {
      this.raise(start, "Unexpected keyword '" + name + "'");
    }
    if (this.options.ecmaVersion < 6 && this.input.slice(start, end).indexOf("\\") !== -1) {
      return;
    }
    var re = this.strict ? this.reservedWordsStrict : this.reservedWords;
    if (re.test(name)) {
      if (!this.inAsync && name === "await") {
        this.raiseRecoverable(start, "Cannot use keyword 'await' outside an async function");
      }
      this.raiseRecoverable(start, "The keyword '" + name + "' is reserved");
    }
  };
  pp$5.parseIdent = function(liberal) {
    var node = this.parseIdentNode();
    this.next(!!liberal);
    this.finishNode(node, "Identifier");
    if (!liberal) {
      this.checkUnreserved(node);
      if (node.name === "await" && !this.awaitIdentPos) {
        this.awaitIdentPos = node.start;
      }
    }
    return node;
  };
  pp$5.parseIdentNode = function() {
    var node = this.startNode();
    if (this.type === types$1.name) {
      node.name = this.value;
    } else if (this.type.keyword) {
      node.name = this.type.keyword;
      if ((node.name === "class" || node.name === "function") && (this.lastTokEnd !== this.lastTokStart + 1 || this.input.charCodeAt(this.lastTokStart) !== 46)) {
        this.context.pop();
      }
      this.type = types$1.name;
    } else {
      this.unexpected();
    }
    return node;
  };
  pp$5.parsePrivateIdent = function() {
    var node = this.startNode();
    if (this.type === types$1.privateId) {
      node.name = this.value;
    } else {
      this.unexpected();
    }
    this.next();
    this.finishNode(node, "PrivateIdentifier");
    if (this.options.checkPrivateFields) {
      if (this.privateNameStack.length === 0) {
        this.raise(node.start, "Private field '#" + node.name + "' must be declared in an enclosing class");
      } else {
        this.privateNameStack[this.privateNameStack.length - 1].used.push(node);
      }
    }
    return node;
  };
  pp$5.parseYield = function(forInit) {
    if (!this.yieldPos) {
      this.yieldPos = this.start;
    }
    var node = this.startNode();
    this.next();
    if (this.type === types$1.semi || this.canInsertSemicolon() || this.type !== types$1.star && !this.type.startsExpr) {
      node.delegate = false;
      node.argument = null;
    } else {
      node.delegate = this.eat(types$1.star);
      node.argument = this.parseMaybeAssign(forInit);
    }
    return this.finishNode(node, "YieldExpression");
  };
  pp$5.parseAwait = function(forInit) {
    if (!this.awaitPos) {
      this.awaitPos = this.start;
    }
    var node = this.startNode();
    this.next();
    node.argument = this.parseMaybeUnary(null, true, false, forInit);
    return this.finishNode(node, "AwaitExpression");
  };
  var pp$4 = Parser.prototype;
  pp$4.raise = function(pos, message) {
    var loc = getLineInfo(this.input, pos);
    message += " (" + loc.line + ":" + loc.column + ")";
    if (this.sourceFile) {
      message += " in " + this.sourceFile;
    }
    var err = new SyntaxError(message);
    err.pos = pos;
    err.loc = loc;
    err.raisedAt = this.pos;
    throw err;
  };
  pp$4.raiseRecoverable = pp$4.raise;
  pp$4.curPosition = function() {
    if (this.options.locations) {
      return new Position(this.curLine, this.pos - this.lineStart);
    }
  };
  var pp$3 = Parser.prototype;
  var Scope = function Scope2(flags) {
    this.flags = flags;
    this.var = [];
    this.lexical = [];
    this.functions = [];
  };
  pp$3.enterScope = function(flags) {
    this.scopeStack.push(new Scope(flags));
  };
  pp$3.exitScope = function() {
    this.scopeStack.pop();
  };
  pp$3.treatFunctionsAsVarInScope = function(scope) {
    return scope.flags & SCOPE_FUNCTION || !this.inModule && scope.flags & SCOPE_TOP;
  };
  pp$3.declareName = function(name, bindingType, pos) {
    var redeclared = false;
    if (bindingType === BIND_LEXICAL) {
      var scope = this.currentScope();
      redeclared = scope.lexical.indexOf(name) > -1 || scope.functions.indexOf(name) > -1 || scope.var.indexOf(name) > -1;
      scope.lexical.push(name);
      if (this.inModule && scope.flags & SCOPE_TOP) {
        delete this.undefinedExports[name];
      }
    } else if (bindingType === BIND_SIMPLE_CATCH) {
      var scope$1 = this.currentScope();
      scope$1.lexical.push(name);
    } else if (bindingType === BIND_FUNCTION) {
      var scope$2 = this.currentScope();
      if (this.treatFunctionsAsVar) {
        redeclared = scope$2.lexical.indexOf(name) > -1;
      } else {
        redeclared = scope$2.lexical.indexOf(name) > -1 || scope$2.var.indexOf(name) > -1;
      }
      scope$2.functions.push(name);
    } else {
      for (var i = this.scopeStack.length - 1; i >= 0; --i) {
        var scope$3 = this.scopeStack[i];
        if (scope$3.lexical.indexOf(name) > -1 && !(scope$3.flags & SCOPE_SIMPLE_CATCH && scope$3.lexical[0] === name) || !this.treatFunctionsAsVarInScope(scope$3) && scope$3.functions.indexOf(name) > -1) {
          redeclared = true;
          break;
        }
        scope$3.var.push(name);
        if (this.inModule && scope$3.flags & SCOPE_TOP) {
          delete this.undefinedExports[name];
        }
        if (scope$3.flags & SCOPE_VAR) {
          break;
        }
      }
    }
    if (redeclared) {
      this.raiseRecoverable(pos, "Identifier '" + name + "' has already been declared");
    }
  };
  pp$3.checkLocalExport = function(id) {
    if (this.scopeStack[0].lexical.indexOf(id.name) === -1 && this.scopeStack[0].var.indexOf(id.name) === -1) {
      this.undefinedExports[id.name] = id;
    }
  };
  pp$3.currentScope = function() {
    return this.scopeStack[this.scopeStack.length - 1];
  };
  pp$3.currentVarScope = function() {
    for (var i = this.scopeStack.length - 1; ; i--) {
      var scope = this.scopeStack[i];
      if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK)) {
        return scope;
      }
    }
  };
  pp$3.currentThisScope = function() {
    for (var i = this.scopeStack.length - 1; ; i--) {
      var scope = this.scopeStack[i];
      if (scope.flags & (SCOPE_VAR | SCOPE_CLASS_FIELD_INIT | SCOPE_CLASS_STATIC_BLOCK) && !(scope.flags & SCOPE_ARROW)) {
        return scope;
      }
    }
  };
  var Node = function Node2(parser, pos, loc) {
    this.type = "";
    this.start = pos;
    this.end = 0;
    if (parser.options.locations) {
      this.loc = new SourceLocation(parser, loc);
    }
    if (parser.options.directSourceFile) {
      this.sourceFile = parser.options.directSourceFile;
    }
    if (parser.options.ranges) {
      this.range = [pos, 0];
    }
  };
  var pp$2 = Parser.prototype;
  pp$2.startNode = function() {
    return new Node(this, this.start, this.startLoc);
  };
  pp$2.startNodeAt = function(pos, loc) {
    return new Node(this, pos, loc);
  };
  function finishNodeAt(node, type, pos, loc) {
    node.type = type;
    node.end = pos;
    if (this.options.locations) {
      node.loc.end = loc;
    }
    if (this.options.ranges) {
      node.range[1] = pos;
    }
    return node;
  }
  pp$2.finishNode = function(node, type) {
    return finishNodeAt.call(this, node, type, this.lastTokEnd, this.lastTokEndLoc);
  };
  pp$2.finishNodeAt = function(node, type, pos, loc) {
    return finishNodeAt.call(this, node, type, pos, loc);
  };
  pp$2.copyNode = function(node) {
    var newNode = new Node(this, node.start, this.startLoc);
    for (var prop in node) {
      newNode[prop] = node[prop];
    }
    return newNode;
  };
  var scriptValuesAddedInUnicode = "Berf Beria_Erfe Gara Garay Gukh Gurung_Khema Hrkt Katakana_Or_Hiragana Kawi Kirat_Rai Krai Nag_Mundari Nagm Ol_Onal Onao Sidetic Sidt Sunu Sunuwar Tai_Yo Tayo Todhri Todr Tolong_Siki Tols Tulu_Tigalari Tutg Unknown Zzzz";
  var ecma9BinaryProperties = "ASCII ASCII_Hex_Digit AHex Alphabetic Alpha Any Assigned Bidi_Control Bidi_C Bidi_Mirrored Bidi_M Case_Ignorable CI Cased Changes_When_Casefolded CWCF Changes_When_Casemapped CWCM Changes_When_Lowercased CWL Changes_When_NFKC_Casefolded CWKCF Changes_When_Titlecased CWT Changes_When_Uppercased CWU Dash Default_Ignorable_Code_Point DI Deprecated Dep Diacritic Dia Emoji Emoji_Component Emoji_Modifier Emoji_Modifier_Base Emoji_Presentation Extender Ext Grapheme_Base Gr_Base Grapheme_Extend Gr_Ext Hex_Digit Hex IDS_Binary_Operator IDSB IDS_Trinary_Operator IDST ID_Continue IDC ID_Start IDS Ideographic Ideo Join_Control Join_C Logical_Order_Exception LOE Lowercase Lower Math Noncharacter_Code_Point NChar Pattern_Syntax Pat_Syn Pattern_White_Space Pat_WS Quotation_Mark QMark Radical Regional_Indicator RI Sentence_Terminal STerm Soft_Dotted SD Terminal_Punctuation Term Unified_Ideograph UIdeo Uppercase Upper Variation_Selector VS White_Space space XID_Continue XIDC XID_Start XIDS";
  var ecma10BinaryProperties = ecma9BinaryProperties + " Extended_Pictographic";
  var ecma11BinaryProperties = ecma10BinaryProperties;
  var ecma12BinaryProperties = ecma11BinaryProperties + " EBase EComp EMod EPres ExtPict";
  var ecma13BinaryProperties = ecma12BinaryProperties;
  var ecma14BinaryProperties = ecma13BinaryProperties;
  var unicodeBinaryProperties = {
    9: ecma9BinaryProperties,
    10: ecma10BinaryProperties,
    11: ecma11BinaryProperties,
    12: ecma12BinaryProperties,
    13: ecma13BinaryProperties,
    14: ecma14BinaryProperties
  };
  var ecma14BinaryPropertiesOfStrings = "Basic_Emoji Emoji_Keycap_Sequence RGI_Emoji_Modifier_Sequence RGI_Emoji_Flag_Sequence RGI_Emoji_Tag_Sequence RGI_Emoji_ZWJ_Sequence RGI_Emoji";
  var unicodeBinaryPropertiesOfStrings = {
    9: "",
    10: "",
    11: "",
    12: "",
    13: "",
    14: ecma14BinaryPropertiesOfStrings
  };
  var unicodeGeneralCategoryValues = "Cased_Letter LC Close_Punctuation Pe Connector_Punctuation Pc Control Cc cntrl Currency_Symbol Sc Dash_Punctuation Pd Decimal_Number Nd digit Enclosing_Mark Me Final_Punctuation Pf Format Cf Initial_Punctuation Pi Letter L Letter_Number Nl Line_Separator Zl Lowercase_Letter Ll Mark M Combining_Mark Math_Symbol Sm Modifier_Letter Lm Modifier_Symbol Sk Nonspacing_Mark Mn Number N Open_Punctuation Ps Other C Other_Letter Lo Other_Number No Other_Punctuation Po Other_Symbol So Paragraph_Separator Zp Private_Use Co Punctuation P punct Separator Z Space_Separator Zs Spacing_Mark Mc Surrogate Cs Symbol S Titlecase_Letter Lt Unassigned Cn Uppercase_Letter Lu";
  var ecma9ScriptValues = "Adlam Adlm Ahom Anatolian_Hieroglyphs Hluw Arabic Arab Armenian Armn Avestan Avst Balinese Bali Bamum Bamu Bassa_Vah Bass Batak Batk Bengali Beng Bhaiksuki Bhks Bopomofo Bopo Brahmi Brah Braille Brai Buginese Bugi Buhid Buhd Canadian_Aboriginal Cans Carian Cari Caucasian_Albanian Aghb Chakma Cakm Cham Cham Cherokee Cher Common Zyyy Coptic Copt Qaac Cuneiform Xsux Cypriot Cprt Cyrillic Cyrl Deseret Dsrt Devanagari Deva Duployan Dupl Egyptian_Hieroglyphs Egyp Elbasan Elba Ethiopic Ethi Georgian Geor Glagolitic Glag Gothic Goth Grantha Gran Greek Grek Gujarati Gujr Gurmukhi Guru Han Hani Hangul Hang Hanunoo Hano Hatran Hatr Hebrew Hebr Hiragana Hira Imperial_Aramaic Armi Inherited Zinh Qaai Inscriptional_Pahlavi Phli Inscriptional_Parthian Prti Javanese Java Kaithi Kthi Kannada Knda Katakana Kana Kayah_Li Kali Kharoshthi Khar Khmer Khmr Khojki Khoj Khudawadi Sind Lao Laoo Latin Latn Lepcha Lepc Limbu Limb Linear_A Lina Linear_B Linb Lisu Lisu Lycian Lyci Lydian Lydi Mahajani Mahj Malayalam Mlym Mandaic Mand Manichaean Mani Marchen Marc Masaram_Gondi Gonm Meetei_Mayek Mtei Mende_Kikakui Mend Meroitic_Cursive Merc Meroitic_Hieroglyphs Mero Miao Plrd Modi Mongolian Mong Mro Mroo Multani Mult Myanmar Mymr Nabataean Nbat New_Tai_Lue Talu Newa Newa Nko Nkoo Nushu Nshu Ogham Ogam Ol_Chiki Olck Old_Hungarian Hung Old_Italic Ital Old_North_Arabian Narb Old_Permic Perm Old_Persian Xpeo Old_South_Arabian Sarb Old_Turkic Orkh Oriya Orya Osage Osge Osmanya Osma Pahawh_Hmong Hmng Palmyrene Palm Pau_Cin_Hau Pauc Phags_Pa Phag Phoenician Phnx Psalter_Pahlavi Phlp Rejang Rjng Runic Runr Samaritan Samr Saurashtra Saur Sharada Shrd Shavian Shaw Siddham Sidd SignWriting Sgnw Sinhala Sinh Sora_Sompeng Sora Soyombo Soyo Sundanese Sund Syloti_Nagri Sylo Syriac Syrc Tagalog Tglg Tagbanwa Tagb Tai_Le Tale Tai_Tham Lana Tai_Viet Tavt Takri Takr Tamil Taml Tangut Tang Telugu Telu Thaana Thaa Thai Thai Tibetan Tibt Tifinagh Tfng Tirhuta Tirh Ugaritic Ugar Vai Vaii Warang_Citi Wara Yi Yiii Zanabazar_Square Zanb";
  var ecma10ScriptValues = ecma9ScriptValues + " Dogra Dogr Gunjala_Gondi Gong Hanifi_Rohingya Rohg Makasar Maka Medefaidrin Medf Old_Sogdian Sogo Sogdian Sogd";
  var ecma11ScriptValues = ecma10ScriptValues + " Elymaic Elym Nandinagari Nand Nyiakeng_Puachue_Hmong Hmnp Wancho Wcho";
  var ecma12ScriptValues = ecma11ScriptValues + " Chorasmian Chrs Diak Dives_Akuru Khitan_Small_Script Kits Yezi Yezidi";
  var ecma13ScriptValues = ecma12ScriptValues + " Cypro_Minoan Cpmn Old_Uyghur Ougr Tangsa Tnsa Toto Vithkuqi Vith";
  var ecma14ScriptValues = ecma13ScriptValues + " " + scriptValuesAddedInUnicode;
  var unicodeScriptValues = {
    9: ecma9ScriptValues,
    10: ecma10ScriptValues,
    11: ecma11ScriptValues,
    12: ecma12ScriptValues,
    13: ecma13ScriptValues,
    14: ecma14ScriptValues
  };
  var data = {};
  function buildUnicodeData(ecmaVersion) {
    var d = data[ecmaVersion] = {
      binary: wordsRegexp(unicodeBinaryProperties[ecmaVersion] + " " + unicodeGeneralCategoryValues),
      binaryOfStrings: wordsRegexp(unicodeBinaryPropertiesOfStrings[ecmaVersion]),
      nonBinary: {
        General_Category: wordsRegexp(unicodeGeneralCategoryValues),
        Script: wordsRegexp(unicodeScriptValues[ecmaVersion])
      }
    };
    d.nonBinary.Script_Extensions = d.nonBinary.Script;
    d.nonBinary.gc = d.nonBinary.General_Category;
    d.nonBinary.sc = d.nonBinary.Script;
    d.nonBinary.scx = d.nonBinary.Script_Extensions;
  }
  for (i = 0, list = [9, 10, 11, 12, 13, 14]; i < list.length; i += 1) {
    ecmaVersion = list[i];
    buildUnicodeData(ecmaVersion);
  }
  var ecmaVersion;
  var i;
  var list;
  var pp$1 = Parser.prototype;
  var BranchID = function BranchID2(parent, base) {
    this.parent = parent;
    this.base = base || this;
  };
  BranchID.prototype.separatedFrom = function separatedFrom(alt) {
    for (var self = this; self; self = self.parent) {
      for (var other = alt; other; other = other.parent) {
        if (self.base === other.base && self !== other) {
          return true;
        }
      }
    }
    return false;
  };
  BranchID.prototype.sibling = function sibling() {
    return new BranchID(this.parent, this.base);
  };
  var RegExpValidationState = function RegExpValidationState2(parser) {
    this.parser = parser;
    this.validFlags = "gim" + (parser.options.ecmaVersion >= 6 ? "uy" : "") + (parser.options.ecmaVersion >= 9 ? "s" : "") + (parser.options.ecmaVersion >= 13 ? "d" : "") + (parser.options.ecmaVersion >= 15 ? "v" : "");
    this.unicodeProperties = data[parser.options.ecmaVersion >= 14 ? 14 : parser.options.ecmaVersion];
    this.source = "";
    this.flags = "";
    this.start = 0;
    this.switchU = false;
    this.switchV = false;
    this.switchN = false;
    this.pos = 0;
    this.lastIntValue = 0;
    this.lastStringValue = "";
    this.lastAssertionIsQuantifiable = false;
    this.numCapturingParens = 0;
    this.maxBackReference = 0;
    this.groupNames = /* @__PURE__ */ Object.create(null);
    this.backReferenceNames = [];
    this.branchID = null;
  };
  RegExpValidationState.prototype.reset = function reset(start, pattern, flags) {
    var unicodeSets = flags.indexOf("v") !== -1;
    var unicode = flags.indexOf("u") !== -1;
    this.start = start | 0;
    this.source = pattern + "";
    this.flags = flags;
    if (unicodeSets && this.parser.options.ecmaVersion >= 15) {
      this.switchU = true;
      this.switchV = true;
      this.switchN = true;
    } else {
      this.switchU = unicode && this.parser.options.ecmaVersion >= 6;
      this.switchV = false;
      this.switchN = unicode && this.parser.options.ecmaVersion >= 9;
    }
  };
  RegExpValidationState.prototype.raise = function raise(message) {
    this.parser.raiseRecoverable(this.start, "Invalid regular expression: /" + this.source + "/: " + message);
  };
  RegExpValidationState.prototype.at = function at(i, forceU) {
    if (forceU === void 0) forceU = false;
    var s = this.source;
    var l = s.length;
    if (i >= l) {
      return -1;
    }
    var c = s.charCodeAt(i);
    if (!(forceU || this.switchU) || c <= 55295 || c >= 57344 || i + 1 >= l) {
      return c;
    }
    var next2 = s.charCodeAt(i + 1);
    return next2 >= 56320 && next2 <= 57343 ? (c << 10) + next2 - 56613888 : c;
  };
  RegExpValidationState.prototype.nextIndex = function nextIndex(i, forceU) {
    if (forceU === void 0) forceU = false;
    var s = this.source;
    var l = s.length;
    if (i >= l) {
      return l;
    }
    var c = s.charCodeAt(i), next2;
    if (!(forceU || this.switchU) || c <= 55295 || c >= 57344 || i + 1 >= l || (next2 = s.charCodeAt(i + 1)) < 56320 || next2 > 57343) {
      return i + 1;
    }
    return i + 2;
  };
  RegExpValidationState.prototype.current = function current(forceU) {
    if (forceU === void 0) forceU = false;
    return this.at(this.pos, forceU);
  };
  RegExpValidationState.prototype.lookahead = function lookahead(forceU) {
    if (forceU === void 0) forceU = false;
    return this.at(this.nextIndex(this.pos, forceU), forceU);
  };
  RegExpValidationState.prototype.advance = function advance(forceU) {
    if (forceU === void 0) forceU = false;
    this.pos = this.nextIndex(this.pos, forceU);
  };
  RegExpValidationState.prototype.eat = function eat(ch, forceU) {
    if (forceU === void 0) forceU = false;
    if (this.current(forceU) === ch) {
      this.advance(forceU);
      return true;
    }
    return false;
  };
  RegExpValidationState.prototype.eatChars = function eatChars(chs, forceU) {
    if (forceU === void 0) forceU = false;
    var pos = this.pos;
    for (var i = 0, list = chs; i < list.length; i += 1) {
      var ch = list[i];
      var current2 = this.at(pos, forceU);
      if (current2 === -1 || current2 !== ch) {
        return false;
      }
      pos = this.nextIndex(pos, forceU);
    }
    this.pos = pos;
    return true;
  };
  pp$1.validateRegExpFlags = function(state2) {
    var validFlags = state2.validFlags;
    var flags = state2.flags;
    var u = false;
    var v = false;
    for (var i = 0; i < flags.length; i++) {
      var flag = flags.charAt(i);
      if (validFlags.indexOf(flag) === -1) {
        this.raise(state2.start, "Invalid regular expression flag");
      }
      if (flags.indexOf(flag, i + 1) > -1) {
        this.raise(state2.start, "Duplicate regular expression flag");
      }
      if (flag === "u") {
        u = true;
      }
      if (flag === "v") {
        v = true;
      }
    }
    if (this.options.ecmaVersion >= 15 && u && v) {
      this.raise(state2.start, "Invalid regular expression flag");
    }
  };
  function hasProp(obj) {
    for (var _ in obj) {
      return true;
    }
    return false;
  }
  pp$1.validateRegExpPattern = function(state2) {
    this.regexp_pattern(state2);
    if (!state2.switchN && this.options.ecmaVersion >= 9 && hasProp(state2.groupNames)) {
      state2.switchN = true;
      this.regexp_pattern(state2);
    }
  };
  pp$1.regexp_pattern = function(state2) {
    state2.pos = 0;
    state2.lastIntValue = 0;
    state2.lastStringValue = "";
    state2.lastAssertionIsQuantifiable = false;
    state2.numCapturingParens = 0;
    state2.maxBackReference = 0;
    state2.groupNames = /* @__PURE__ */ Object.create(null);
    state2.backReferenceNames.length = 0;
    state2.branchID = null;
    this.regexp_disjunction(state2);
    if (state2.pos !== state2.source.length) {
      if (state2.eat(
        41
        /* ) */
      )) {
        state2.raise("Unmatched ')'");
      }
      if (state2.eat(
        93
        /* ] */
      ) || state2.eat(
        125
        /* } */
      )) {
        state2.raise("Lone quantifier brackets");
      }
    }
    if (state2.maxBackReference > state2.numCapturingParens) {
      state2.raise("Invalid escape");
    }
    for (var i = 0, list = state2.backReferenceNames; i < list.length; i += 1) {
      var name = list[i];
      if (!state2.groupNames[name]) {
        state2.raise("Invalid named capture referenced");
      }
    }
  };
  pp$1.regexp_disjunction = function(state2) {
    var trackDisjunction = this.options.ecmaVersion >= 16;
    if (trackDisjunction) {
      state2.branchID = new BranchID(state2.branchID, null);
    }
    this.regexp_alternative(state2);
    while (state2.eat(
      124
      /* | */
    )) {
      if (trackDisjunction) {
        state2.branchID = state2.branchID.sibling();
      }
      this.regexp_alternative(state2);
    }
    if (trackDisjunction) {
      state2.branchID = state2.branchID.parent;
    }
    if (this.regexp_eatQuantifier(state2, true)) {
      state2.raise("Nothing to repeat");
    }
    if (state2.eat(
      123
      /* { */
    )) {
      state2.raise("Lone quantifier brackets");
    }
  };
  pp$1.regexp_alternative = function(state2) {
    while (state2.pos < state2.source.length && this.regexp_eatTerm(state2)) {
    }
  };
  pp$1.regexp_eatTerm = function(state2) {
    if (this.regexp_eatAssertion(state2)) {
      if (state2.lastAssertionIsQuantifiable && this.regexp_eatQuantifier(state2)) {
        if (state2.switchU) {
          state2.raise("Invalid quantifier");
        }
      }
      return true;
    }
    if (state2.switchU ? this.regexp_eatAtom(state2) : this.regexp_eatExtendedAtom(state2)) {
      this.regexp_eatQuantifier(state2);
      return true;
    }
    return false;
  };
  pp$1.regexp_eatAssertion = function(state2) {
    var start = state2.pos;
    state2.lastAssertionIsQuantifiable = false;
    if (state2.eat(
      94
      /* ^ */
    ) || state2.eat(
      36
      /* $ */
    )) {
      return true;
    }
    if (state2.eat(
      92
      /* \ */
    )) {
      if (state2.eat(
        66
        /* B */
      ) || state2.eat(
        98
        /* b */
      )) {
        return true;
      }
      state2.pos = start;
    }
    if (state2.eat(
      40
      /* ( */
    ) && state2.eat(
      63
      /* ? */
    )) {
      var lookbehind = false;
      if (this.options.ecmaVersion >= 9) {
        lookbehind = state2.eat(
          60
          /* < */
        );
      }
      if (state2.eat(
        61
        /* = */
      ) || state2.eat(
        33
        /* ! */
      )) {
        this.regexp_disjunction(state2);
        if (!state2.eat(
          41
          /* ) */
        )) {
          state2.raise("Unterminated group");
        }
        state2.lastAssertionIsQuantifiable = !lookbehind;
        return true;
      }
    }
    state2.pos = start;
    return false;
  };
  pp$1.regexp_eatQuantifier = function(state2, noError) {
    if (noError === void 0) noError = false;
    if (this.regexp_eatQuantifierPrefix(state2, noError)) {
      state2.eat(
        63
        /* ? */
      );
      return true;
    }
    return false;
  };
  pp$1.regexp_eatQuantifierPrefix = function(state2, noError) {
    return state2.eat(
      42
      /* * */
    ) || state2.eat(
      43
      /* + */
    ) || state2.eat(
      63
      /* ? */
    ) || this.regexp_eatBracedQuantifier(state2, noError);
  };
  pp$1.regexp_eatBracedQuantifier = function(state2, noError) {
    var start = state2.pos;
    if (state2.eat(
      123
      /* { */
    )) {
      var min = 0, max = -1;
      if (this.regexp_eatDecimalDigits(state2)) {
        min = state2.lastIntValue;
        if (state2.eat(
          44
          /* , */
        ) && this.regexp_eatDecimalDigits(state2)) {
          max = state2.lastIntValue;
        }
        if (state2.eat(
          125
          /* } */
        )) {
          if (max !== -1 && max < min && !noError) {
            state2.raise("numbers out of order in {} quantifier");
          }
          return true;
        }
      }
      if (state2.switchU && !noError) {
        state2.raise("Incomplete quantifier");
      }
      state2.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatAtom = function(state2) {
    return this.regexp_eatPatternCharacters(state2) || state2.eat(
      46
      /* . */
    ) || this.regexp_eatReverseSolidusAtomEscape(state2) || this.regexp_eatCharacterClass(state2) || this.regexp_eatUncapturingGroup(state2) || this.regexp_eatCapturingGroup(state2);
  };
  pp$1.regexp_eatReverseSolidusAtomEscape = function(state2) {
    var start = state2.pos;
    if (state2.eat(
      92
      /* \ */
    )) {
      if (this.regexp_eatAtomEscape(state2)) {
        return true;
      }
      state2.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatUncapturingGroup = function(state2) {
    var start = state2.pos;
    if (state2.eat(
      40
      /* ( */
    )) {
      if (state2.eat(
        63
        /* ? */
      )) {
        if (this.options.ecmaVersion >= 16) {
          var addModifiers = this.regexp_eatModifiers(state2);
          var hasHyphen = state2.eat(
            45
            /* - */
          );
          if (addModifiers || hasHyphen) {
            for (var i = 0; i < addModifiers.length; i++) {
              var modifier = addModifiers.charAt(i);
              if (addModifiers.indexOf(modifier, i + 1) > -1) {
                state2.raise("Duplicate regular expression modifiers");
              }
            }
            if (hasHyphen) {
              var removeModifiers = this.regexp_eatModifiers(state2);
              if (!addModifiers && !removeModifiers && state2.current() === 58) {
                state2.raise("Invalid regular expression modifiers");
              }
              for (var i$1 = 0; i$1 < removeModifiers.length; i$1++) {
                var modifier$1 = removeModifiers.charAt(i$1);
                if (removeModifiers.indexOf(modifier$1, i$1 + 1) > -1 || addModifiers.indexOf(modifier$1) > -1) {
                  state2.raise("Duplicate regular expression modifiers");
                }
              }
            }
          }
        }
        if (state2.eat(
          58
          /* : */
        )) {
          this.regexp_disjunction(state2);
          if (state2.eat(
            41
            /* ) */
          )) {
            return true;
          }
          state2.raise("Unterminated group");
        }
      }
      state2.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatCapturingGroup = function(state2) {
    if (state2.eat(
      40
      /* ( */
    )) {
      if (this.options.ecmaVersion >= 9) {
        this.regexp_groupSpecifier(state2);
      } else if (state2.current() === 63) {
        state2.raise("Invalid group");
      }
      this.regexp_disjunction(state2);
      if (state2.eat(
        41
        /* ) */
      )) {
        state2.numCapturingParens += 1;
        return true;
      }
      state2.raise("Unterminated group");
    }
    return false;
  };
  pp$1.regexp_eatModifiers = function(state2) {
    var modifiers = "";
    var ch = 0;
    while ((ch = state2.current()) !== -1 && isRegularExpressionModifier(ch)) {
      modifiers += codePointToString(ch);
      state2.advance();
    }
    return modifiers;
  };
  function isRegularExpressionModifier(ch) {
    return ch === 105 || ch === 109 || ch === 115;
  }
  pp$1.regexp_eatExtendedAtom = function(state2) {
    return state2.eat(
      46
      /* . */
    ) || this.regexp_eatReverseSolidusAtomEscape(state2) || this.regexp_eatCharacterClass(state2) || this.regexp_eatUncapturingGroup(state2) || this.regexp_eatCapturingGroup(state2) || this.regexp_eatInvalidBracedQuantifier(state2) || this.regexp_eatExtendedPatternCharacter(state2);
  };
  pp$1.regexp_eatInvalidBracedQuantifier = function(state2) {
    if (this.regexp_eatBracedQuantifier(state2, true)) {
      state2.raise("Nothing to repeat");
    }
    return false;
  };
  pp$1.regexp_eatSyntaxCharacter = function(state2) {
    var ch = state2.current();
    if (isSyntaxCharacter(ch)) {
      state2.lastIntValue = ch;
      state2.advance();
      return true;
    }
    return false;
  };
  function isSyntaxCharacter(ch) {
    return ch === 36 || ch >= 40 && ch <= 43 || ch === 46 || ch === 63 || ch >= 91 && ch <= 94 || ch >= 123 && ch <= 125;
  }
  pp$1.regexp_eatPatternCharacters = function(state2) {
    var start = state2.pos;
    var ch = 0;
    while ((ch = state2.current()) !== -1 && !isSyntaxCharacter(ch)) {
      state2.advance();
    }
    return state2.pos !== start;
  };
  pp$1.regexp_eatExtendedPatternCharacter = function(state2) {
    var ch = state2.current();
    if (ch !== -1 && ch !== 36 && !(ch >= 40 && ch <= 43) && ch !== 46 && ch !== 63 && ch !== 91 && ch !== 94 && ch !== 124) {
      state2.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_groupSpecifier = function(state2) {
    if (state2.eat(
      63
      /* ? */
    )) {
      if (!this.regexp_eatGroupName(state2)) {
        state2.raise("Invalid group");
      }
      var trackDisjunction = this.options.ecmaVersion >= 16;
      var known = state2.groupNames[state2.lastStringValue];
      if (known) {
        if (trackDisjunction) {
          for (var i = 0, list = known; i < list.length; i += 1) {
            var altID = list[i];
            if (!altID.separatedFrom(state2.branchID)) {
              state2.raise("Duplicate capture group name");
            }
          }
        } else {
          state2.raise("Duplicate capture group name");
        }
      }
      if (trackDisjunction) {
        (known || (state2.groupNames[state2.lastStringValue] = [])).push(state2.branchID);
      } else {
        state2.groupNames[state2.lastStringValue] = true;
      }
    }
  };
  pp$1.regexp_eatGroupName = function(state2) {
    state2.lastStringValue = "";
    if (state2.eat(
      60
      /* < */
    )) {
      if (this.regexp_eatRegExpIdentifierName(state2) && state2.eat(
        62
        /* > */
      )) {
        return true;
      }
      state2.raise("Invalid capture group name");
    }
    return false;
  };
  pp$1.regexp_eatRegExpIdentifierName = function(state2) {
    state2.lastStringValue = "";
    if (this.regexp_eatRegExpIdentifierStart(state2)) {
      state2.lastStringValue += codePointToString(state2.lastIntValue);
      while (this.regexp_eatRegExpIdentifierPart(state2)) {
        state2.lastStringValue += codePointToString(state2.lastIntValue);
      }
      return true;
    }
    return false;
  };
  pp$1.regexp_eatRegExpIdentifierStart = function(state2) {
    var start = state2.pos;
    var forceU = this.options.ecmaVersion >= 11;
    var ch = state2.current(forceU);
    state2.advance(forceU);
    if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state2, forceU)) {
      ch = state2.lastIntValue;
    }
    if (isRegExpIdentifierStart(ch)) {
      state2.lastIntValue = ch;
      return true;
    }
    state2.pos = start;
    return false;
  };
  function isRegExpIdentifierStart(ch) {
    return isIdentifierStart(ch, true) || ch === 36 || ch === 95;
  }
  pp$1.regexp_eatRegExpIdentifierPart = function(state2) {
    var start = state2.pos;
    var forceU = this.options.ecmaVersion >= 11;
    var ch = state2.current(forceU);
    state2.advance(forceU);
    if (ch === 92 && this.regexp_eatRegExpUnicodeEscapeSequence(state2, forceU)) {
      ch = state2.lastIntValue;
    }
    if (isRegExpIdentifierPart(ch)) {
      state2.lastIntValue = ch;
      return true;
    }
    state2.pos = start;
    return false;
  };
  function isRegExpIdentifierPart(ch) {
    return isIdentifierChar(ch, true) || ch === 36 || ch === 95 || ch === 8204 || ch === 8205;
  }
  pp$1.regexp_eatAtomEscape = function(state2) {
    if (this.regexp_eatBackReference(state2) || this.regexp_eatCharacterClassEscape(state2) || this.regexp_eatCharacterEscape(state2) || state2.switchN && this.regexp_eatKGroupName(state2)) {
      return true;
    }
    if (state2.switchU) {
      if (state2.current() === 99) {
        state2.raise("Invalid unicode escape");
      }
      state2.raise("Invalid escape");
    }
    return false;
  };
  pp$1.regexp_eatBackReference = function(state2) {
    var start = state2.pos;
    if (this.regexp_eatDecimalEscape(state2)) {
      var n = state2.lastIntValue;
      if (state2.switchU) {
        if (n > state2.maxBackReference) {
          state2.maxBackReference = n;
        }
        return true;
      }
      if (n <= state2.numCapturingParens) {
        return true;
      }
      state2.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatKGroupName = function(state2) {
    if (state2.eat(
      107
      /* k */
    )) {
      if (this.regexp_eatGroupName(state2)) {
        state2.backReferenceNames.push(state2.lastStringValue);
        return true;
      }
      state2.raise("Invalid named reference");
    }
    return false;
  };
  pp$1.regexp_eatCharacterEscape = function(state2) {
    return this.regexp_eatControlEscape(state2) || this.regexp_eatCControlLetter(state2) || this.regexp_eatZero(state2) || this.regexp_eatHexEscapeSequence(state2) || this.regexp_eatRegExpUnicodeEscapeSequence(state2, false) || !state2.switchU && this.regexp_eatLegacyOctalEscapeSequence(state2) || this.regexp_eatIdentityEscape(state2);
  };
  pp$1.regexp_eatCControlLetter = function(state2) {
    var start = state2.pos;
    if (state2.eat(
      99
      /* c */
    )) {
      if (this.regexp_eatControlLetter(state2)) {
        return true;
      }
      state2.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatZero = function(state2) {
    if (state2.current() === 48 && !isDecimalDigit(state2.lookahead())) {
      state2.lastIntValue = 0;
      state2.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_eatControlEscape = function(state2) {
    var ch = state2.current();
    if (ch === 116) {
      state2.lastIntValue = 9;
      state2.advance();
      return true;
    }
    if (ch === 110) {
      state2.lastIntValue = 10;
      state2.advance();
      return true;
    }
    if (ch === 118) {
      state2.lastIntValue = 11;
      state2.advance();
      return true;
    }
    if (ch === 102) {
      state2.lastIntValue = 12;
      state2.advance();
      return true;
    }
    if (ch === 114) {
      state2.lastIntValue = 13;
      state2.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_eatControlLetter = function(state2) {
    var ch = state2.current();
    if (isControlLetter(ch)) {
      state2.lastIntValue = ch % 32;
      state2.advance();
      return true;
    }
    return false;
  };
  function isControlLetter(ch) {
    return ch >= 65 && ch <= 90 || ch >= 97 && ch <= 122;
  }
  pp$1.regexp_eatRegExpUnicodeEscapeSequence = function(state2, forceU) {
    if (forceU === void 0) forceU = false;
    var start = state2.pos;
    var switchU = forceU || state2.switchU;
    if (state2.eat(
      117
      /* u */
    )) {
      if (this.regexp_eatFixedHexDigits(state2, 4)) {
        var lead = state2.lastIntValue;
        if (switchU && lead >= 55296 && lead <= 56319) {
          var leadSurrogateEnd = state2.pos;
          if (state2.eat(
            92
            /* \ */
          ) && state2.eat(
            117
            /* u */
          ) && this.regexp_eatFixedHexDigits(state2, 4)) {
            var trail = state2.lastIntValue;
            if (trail >= 56320 && trail <= 57343) {
              state2.lastIntValue = (lead - 55296) * 1024 + (trail - 56320) + 65536;
              return true;
            }
          }
          state2.pos = leadSurrogateEnd;
          state2.lastIntValue = lead;
        }
        return true;
      }
      if (switchU && state2.eat(
        123
        /* { */
      ) && this.regexp_eatHexDigits(state2) && state2.eat(
        125
        /* } */
      ) && isValidUnicode(state2.lastIntValue)) {
        return true;
      }
      if (switchU) {
        state2.raise("Invalid unicode escape");
      }
      state2.pos = start;
    }
    return false;
  };
  function isValidUnicode(ch) {
    return ch >= 0 && ch <= 1114111;
  }
  pp$1.regexp_eatIdentityEscape = function(state2) {
    if (state2.switchU) {
      if (this.regexp_eatSyntaxCharacter(state2)) {
        return true;
      }
      if (state2.eat(
        47
        /* / */
      )) {
        state2.lastIntValue = 47;
        return true;
      }
      return false;
    }
    var ch = state2.current();
    if (ch !== 99 && (!state2.switchN || ch !== 107)) {
      state2.lastIntValue = ch;
      state2.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_eatDecimalEscape = function(state2) {
    state2.lastIntValue = 0;
    var ch = state2.current();
    if (ch >= 49 && ch <= 57) {
      do {
        state2.lastIntValue = 10 * state2.lastIntValue + (ch - 48);
        state2.advance();
      } while ((ch = state2.current()) >= 48 && ch <= 57);
      return true;
    }
    return false;
  };
  var CharSetNone = 0;
  var CharSetOk = 1;
  var CharSetString = 2;
  pp$1.regexp_eatCharacterClassEscape = function(state2) {
    var ch = state2.current();
    if (isCharacterClassEscape(ch)) {
      state2.lastIntValue = -1;
      state2.advance();
      return CharSetOk;
    }
    var negate = false;
    if (state2.switchU && this.options.ecmaVersion >= 9 && ((negate = ch === 80) || ch === 112)) {
      state2.lastIntValue = -1;
      state2.advance();
      var result;
      if (state2.eat(
        123
        /* { */
      ) && (result = this.regexp_eatUnicodePropertyValueExpression(state2)) && state2.eat(
        125
        /* } */
      )) {
        if (negate && result === CharSetString) {
          state2.raise("Invalid property name");
        }
        return result;
      }
      state2.raise("Invalid property name");
    }
    return CharSetNone;
  };
  function isCharacterClassEscape(ch) {
    return ch === 100 || ch === 68 || ch === 115 || ch === 83 || ch === 119 || ch === 87;
  }
  pp$1.regexp_eatUnicodePropertyValueExpression = function(state2) {
    var start = state2.pos;
    if (this.regexp_eatUnicodePropertyName(state2) && state2.eat(
      61
      /* = */
    )) {
      var name = state2.lastStringValue;
      if (this.regexp_eatUnicodePropertyValue(state2)) {
        var value = state2.lastStringValue;
        this.regexp_validateUnicodePropertyNameAndValue(state2, name, value);
        return CharSetOk;
      }
    }
    state2.pos = start;
    if (this.regexp_eatLoneUnicodePropertyNameOrValue(state2)) {
      var nameOrValue = state2.lastStringValue;
      return this.regexp_validateUnicodePropertyNameOrValue(state2, nameOrValue);
    }
    return CharSetNone;
  };
  pp$1.regexp_validateUnicodePropertyNameAndValue = function(state2, name, value) {
    if (!hasOwn(state2.unicodeProperties.nonBinary, name)) {
      state2.raise("Invalid property name");
    }
    if (!state2.unicodeProperties.nonBinary[name].test(value)) {
      state2.raise("Invalid property value");
    }
  };
  pp$1.regexp_validateUnicodePropertyNameOrValue = function(state2, nameOrValue) {
    if (state2.unicodeProperties.binary.test(nameOrValue)) {
      return CharSetOk;
    }
    if (state2.switchV && state2.unicodeProperties.binaryOfStrings.test(nameOrValue)) {
      return CharSetString;
    }
    state2.raise("Invalid property name");
  };
  pp$1.regexp_eatUnicodePropertyName = function(state2) {
    var ch = 0;
    state2.lastStringValue = "";
    while (isUnicodePropertyNameCharacter(ch = state2.current())) {
      state2.lastStringValue += codePointToString(ch);
      state2.advance();
    }
    return state2.lastStringValue !== "";
  };
  function isUnicodePropertyNameCharacter(ch) {
    return isControlLetter(ch) || ch === 95;
  }
  pp$1.regexp_eatUnicodePropertyValue = function(state2) {
    var ch = 0;
    state2.lastStringValue = "";
    while (isUnicodePropertyValueCharacter(ch = state2.current())) {
      state2.lastStringValue += codePointToString(ch);
      state2.advance();
    }
    return state2.lastStringValue !== "";
  };
  function isUnicodePropertyValueCharacter(ch) {
    return isUnicodePropertyNameCharacter(ch) || isDecimalDigit(ch);
  }
  pp$1.regexp_eatLoneUnicodePropertyNameOrValue = function(state2) {
    return this.regexp_eatUnicodePropertyValue(state2);
  };
  pp$1.regexp_eatCharacterClass = function(state2) {
    if (state2.eat(
      91
      /* [ */
    )) {
      var negate = state2.eat(
        94
        /* ^ */
      );
      var result = this.regexp_classContents(state2);
      if (!state2.eat(
        93
        /* ] */
      )) {
        state2.raise("Unterminated character class");
      }
      if (negate && result === CharSetString) {
        state2.raise("Negated character class may contain strings");
      }
      return true;
    }
    return false;
  };
  pp$1.regexp_classContents = function(state2) {
    if (state2.current() === 93) {
      return CharSetOk;
    }
    if (state2.switchV) {
      return this.regexp_classSetExpression(state2);
    }
    this.regexp_nonEmptyClassRanges(state2);
    return CharSetOk;
  };
  pp$1.regexp_nonEmptyClassRanges = function(state2) {
    while (this.regexp_eatClassAtom(state2)) {
      var left = state2.lastIntValue;
      if (state2.eat(
        45
        /* - */
      ) && this.regexp_eatClassAtom(state2)) {
        var right = state2.lastIntValue;
        if (state2.switchU && (left === -1 || right === -1)) {
          state2.raise("Invalid character class");
        }
        if (left !== -1 && right !== -1 && left > right) {
          state2.raise("Range out of order in character class");
        }
      }
    }
  };
  pp$1.regexp_eatClassAtom = function(state2) {
    var start = state2.pos;
    if (state2.eat(
      92
      /* \ */
    )) {
      if (this.regexp_eatClassEscape(state2)) {
        return true;
      }
      if (state2.switchU) {
        var ch$1 = state2.current();
        if (ch$1 === 99 || isOctalDigit(ch$1)) {
          state2.raise("Invalid class escape");
        }
        state2.raise("Invalid escape");
      }
      state2.pos = start;
    }
    var ch = state2.current();
    if (ch !== 93) {
      state2.lastIntValue = ch;
      state2.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_eatClassEscape = function(state2) {
    var start = state2.pos;
    if (state2.eat(
      98
      /* b */
    )) {
      state2.lastIntValue = 8;
      return true;
    }
    if (state2.switchU && state2.eat(
      45
      /* - */
    )) {
      state2.lastIntValue = 45;
      return true;
    }
    if (!state2.switchU && state2.eat(
      99
      /* c */
    )) {
      if (this.regexp_eatClassControlLetter(state2)) {
        return true;
      }
      state2.pos = start;
    }
    return this.regexp_eatCharacterClassEscape(state2) || this.regexp_eatCharacterEscape(state2);
  };
  pp$1.regexp_classSetExpression = function(state2) {
    var result = CharSetOk, subResult;
    if (this.regexp_eatClassSetRange(state2)) ;
    else if (subResult = this.regexp_eatClassSetOperand(state2)) {
      if (subResult === CharSetString) {
        result = CharSetString;
      }
      var start = state2.pos;
      while (state2.eatChars(
        [38, 38]
        /* && */
      )) {
        if (state2.current() !== 38 && (subResult = this.regexp_eatClassSetOperand(state2))) {
          if (subResult !== CharSetString) {
            result = CharSetOk;
          }
          continue;
        }
        state2.raise("Invalid character in character class");
      }
      if (start !== state2.pos) {
        return result;
      }
      while (state2.eatChars(
        [45, 45]
        /* -- */
      )) {
        if (this.regexp_eatClassSetOperand(state2)) {
          continue;
        }
        state2.raise("Invalid character in character class");
      }
      if (start !== state2.pos) {
        return result;
      }
    } else {
      state2.raise("Invalid character in character class");
    }
    for (; ; ) {
      if (this.regexp_eatClassSetRange(state2)) {
        continue;
      }
      subResult = this.regexp_eatClassSetOperand(state2);
      if (!subResult) {
        return result;
      }
      if (subResult === CharSetString) {
        result = CharSetString;
      }
    }
  };
  pp$1.regexp_eatClassSetRange = function(state2) {
    var start = state2.pos;
    if (this.regexp_eatClassSetCharacter(state2)) {
      var left = state2.lastIntValue;
      if (state2.eat(
        45
        /* - */
      ) && this.regexp_eatClassSetCharacter(state2)) {
        var right = state2.lastIntValue;
        if (left !== -1 && right !== -1 && left > right) {
          state2.raise("Range out of order in character class");
        }
        return true;
      }
      state2.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatClassSetOperand = function(state2) {
    if (this.regexp_eatClassSetCharacter(state2)) {
      return CharSetOk;
    }
    return this.regexp_eatClassStringDisjunction(state2) || this.regexp_eatNestedClass(state2);
  };
  pp$1.regexp_eatNestedClass = function(state2) {
    var start = state2.pos;
    if (state2.eat(
      91
      /* [ */
    )) {
      var negate = state2.eat(
        94
        /* ^ */
      );
      var result = this.regexp_classContents(state2);
      if (state2.eat(
        93
        /* ] */
      )) {
        if (negate && result === CharSetString) {
          state2.raise("Negated character class may contain strings");
        }
        return result;
      }
      state2.pos = start;
    }
    if (state2.eat(
      92
      /* \ */
    )) {
      var result$1 = this.regexp_eatCharacterClassEscape(state2);
      if (result$1) {
        return result$1;
      }
      state2.pos = start;
    }
    return null;
  };
  pp$1.regexp_eatClassStringDisjunction = function(state2) {
    var start = state2.pos;
    if (state2.eatChars(
      [92, 113]
      /* \q */
    )) {
      if (state2.eat(
        123
        /* { */
      )) {
        var result = this.regexp_classStringDisjunctionContents(state2);
        if (state2.eat(
          125
          /* } */
        )) {
          return result;
        }
      } else {
        state2.raise("Invalid escape");
      }
      state2.pos = start;
    }
    return null;
  };
  pp$1.regexp_classStringDisjunctionContents = function(state2) {
    var result = this.regexp_classString(state2);
    while (state2.eat(
      124
      /* | */
    )) {
      if (this.regexp_classString(state2) === CharSetString) {
        result = CharSetString;
      }
    }
    return result;
  };
  pp$1.regexp_classString = function(state2) {
    var count = 0;
    while (this.regexp_eatClassSetCharacter(state2)) {
      count++;
    }
    return count === 1 ? CharSetOk : CharSetString;
  };
  pp$1.regexp_eatClassSetCharacter = function(state2) {
    var start = state2.pos;
    if (state2.eat(
      92
      /* \ */
    )) {
      if (this.regexp_eatCharacterEscape(state2) || this.regexp_eatClassSetReservedPunctuator(state2)) {
        return true;
      }
      if (state2.eat(
        98
        /* b */
      )) {
        state2.lastIntValue = 8;
        return true;
      }
      state2.pos = start;
      return false;
    }
    var ch = state2.current();
    if (ch < 0 || ch === state2.lookahead() && isClassSetReservedDoublePunctuatorCharacter(ch)) {
      return false;
    }
    if (isClassSetSyntaxCharacter(ch)) {
      return false;
    }
    state2.advance();
    state2.lastIntValue = ch;
    return true;
  };
  function isClassSetReservedDoublePunctuatorCharacter(ch) {
    return ch === 33 || ch >= 35 && ch <= 38 || ch >= 42 && ch <= 44 || ch === 46 || ch >= 58 && ch <= 64 || ch === 94 || ch === 96 || ch === 126;
  }
  function isClassSetSyntaxCharacter(ch) {
    return ch === 40 || ch === 41 || ch === 45 || ch === 47 || ch >= 91 && ch <= 93 || ch >= 123 && ch <= 125;
  }
  pp$1.regexp_eatClassSetReservedPunctuator = function(state2) {
    var ch = state2.current();
    if (isClassSetReservedPunctuator(ch)) {
      state2.lastIntValue = ch;
      state2.advance();
      return true;
    }
    return false;
  };
  function isClassSetReservedPunctuator(ch) {
    return ch === 33 || ch === 35 || ch === 37 || ch === 38 || ch === 44 || ch === 45 || ch >= 58 && ch <= 62 || ch === 64 || ch === 96 || ch === 126;
  }
  pp$1.regexp_eatClassControlLetter = function(state2) {
    var ch = state2.current();
    if (isDecimalDigit(ch) || ch === 95) {
      state2.lastIntValue = ch % 32;
      state2.advance();
      return true;
    }
    return false;
  };
  pp$1.regexp_eatHexEscapeSequence = function(state2) {
    var start = state2.pos;
    if (state2.eat(
      120
      /* x */
    )) {
      if (this.regexp_eatFixedHexDigits(state2, 2)) {
        return true;
      }
      if (state2.switchU) {
        state2.raise("Invalid escape");
      }
      state2.pos = start;
    }
    return false;
  };
  pp$1.regexp_eatDecimalDigits = function(state2) {
    var start = state2.pos;
    var ch = 0;
    state2.lastIntValue = 0;
    while (isDecimalDigit(ch = state2.current())) {
      state2.lastIntValue = 10 * state2.lastIntValue + (ch - 48);
      state2.advance();
    }
    return state2.pos !== start;
  };
  function isDecimalDigit(ch) {
    return ch >= 48 && ch <= 57;
  }
  pp$1.regexp_eatHexDigits = function(state2) {
    var start = state2.pos;
    var ch = 0;
    state2.lastIntValue = 0;
    while (isHexDigit(ch = state2.current())) {
      state2.lastIntValue = 16 * state2.lastIntValue + hexToInt(ch);
      state2.advance();
    }
    return state2.pos !== start;
  };
  function isHexDigit(ch) {
    return ch >= 48 && ch <= 57 || ch >= 65 && ch <= 70 || ch >= 97 && ch <= 102;
  }
  function hexToInt(ch) {
    if (ch >= 65 && ch <= 70) {
      return 10 + (ch - 65);
    }
    if (ch >= 97 && ch <= 102) {
      return 10 + (ch - 97);
    }
    return ch - 48;
  }
  pp$1.regexp_eatLegacyOctalEscapeSequence = function(state2) {
    if (this.regexp_eatOctalDigit(state2)) {
      var n1 = state2.lastIntValue;
      if (this.regexp_eatOctalDigit(state2)) {
        var n2 = state2.lastIntValue;
        if (n1 <= 3 && this.regexp_eatOctalDigit(state2)) {
          state2.lastIntValue = n1 * 64 + n2 * 8 + state2.lastIntValue;
        } else {
          state2.lastIntValue = n1 * 8 + n2;
        }
      } else {
        state2.lastIntValue = n1;
      }
      return true;
    }
    return false;
  };
  pp$1.regexp_eatOctalDigit = function(state2) {
    var ch = state2.current();
    if (isOctalDigit(ch)) {
      state2.lastIntValue = ch - 48;
      state2.advance();
      return true;
    }
    state2.lastIntValue = 0;
    return false;
  };
  function isOctalDigit(ch) {
    return ch >= 48 && ch <= 55;
  }
  pp$1.regexp_eatFixedHexDigits = function(state2, length) {
    var start = state2.pos;
    state2.lastIntValue = 0;
    for (var i = 0; i < length; ++i) {
      var ch = state2.current();
      if (!isHexDigit(ch)) {
        state2.pos = start;
        return false;
      }
      state2.lastIntValue = 16 * state2.lastIntValue + hexToInt(ch);
      state2.advance();
    }
    return true;
  };
  var Token = function Token2(p) {
    this.type = p.type;
    this.value = p.value;
    this.start = p.start;
    this.end = p.end;
    if (p.options.locations) {
      this.loc = new SourceLocation(p, p.startLoc, p.endLoc);
    }
    if (p.options.ranges) {
      this.range = [p.start, p.end];
    }
  };
  var pp = Parser.prototype;
  pp.next = function(ignoreEscapeSequenceInKeyword) {
    if (!ignoreEscapeSequenceInKeyword && this.type.keyword && this.containsEsc) {
      this.raiseRecoverable(this.start, "Escape sequence in keyword " + this.type.keyword);
    }
    if (this.options.onToken) {
      this.options.onToken(new Token(this));
    }
    this.lastTokEnd = this.end;
    this.lastTokStart = this.start;
    this.lastTokEndLoc = this.endLoc;
    this.lastTokStartLoc = this.startLoc;
    this.nextToken();
  };
  pp.getToken = function() {
    this.next();
    return new Token(this);
  };
  if (typeof Symbol !== "undefined") {
    pp[Symbol.iterator] = function() {
      var this$1$1 = this;
      return {
        next: function() {
          var token = this$1$1.getToken();
          return {
            done: token.type === types$1.eof,
            value: token
          };
        }
      };
    };
  }
  pp.nextToken = function() {
    var curContext = this.curContext();
    if (!curContext || !curContext.preserveSpace) {
      this.skipSpace();
    }
    this.start = this.pos;
    if (this.options.locations) {
      this.startLoc = this.curPosition();
    }
    if (this.pos >= this.input.length) {
      return this.finishToken(types$1.eof);
    }
    if (curContext.override) {
      return curContext.override(this);
    } else {
      this.readToken(this.fullCharCodeAtPos());
    }
  };
  pp.readToken = function(code) {
    if (isIdentifierStart(code, this.options.ecmaVersion >= 6) || code === 92) {
      return this.readWord();
    }
    return this.getTokenFromCode(code);
  };
  pp.fullCharCodeAt = function(pos) {
    var code = this.input.charCodeAt(pos);
    if (code <= 55295 || code >= 56320) {
      return code;
    }
    var next2 = this.input.charCodeAt(pos + 1);
    return next2 <= 56319 || next2 >= 57344 ? code : (code << 10) + next2 - 56613888;
  };
  pp.fullCharCodeAtPos = function() {
    return this.fullCharCodeAt(this.pos);
  };
  pp.skipBlockComment = function() {
    var startLoc = this.options.onComment && this.curPosition();
    var start = this.pos, end = this.input.indexOf("*/", this.pos += 2);
    if (end === -1) {
      this.raise(this.pos - 2, "Unterminated comment");
    }
    this.pos = end + 2;
    if (this.options.locations) {
      for (var nextBreak = void 0, pos = start; (nextBreak = nextLineBreak(this.input, pos, this.pos)) > -1; ) {
        ++this.curLine;
        pos = this.lineStart = nextBreak;
      }
    }
    if (this.options.onComment) {
      this.options.onComment(
        true,
        this.input.slice(start + 2, end),
        start,
        this.pos,
        startLoc,
        this.curPosition()
      );
    }
  };
  pp.skipLineComment = function(startSkip) {
    var start = this.pos;
    var startLoc = this.options.onComment && this.curPosition();
    var ch = this.input.charCodeAt(this.pos += startSkip);
    while (this.pos < this.input.length && !isNewLine(ch)) {
      ch = this.input.charCodeAt(++this.pos);
    }
    if (this.options.onComment) {
      this.options.onComment(
        false,
        this.input.slice(start + startSkip, this.pos),
        start,
        this.pos,
        startLoc,
        this.curPosition()
      );
    }
  };
  pp.skipSpace = function() {
    loop: while (this.pos < this.input.length) {
      var ch = this.input.charCodeAt(this.pos);
      switch (ch) {
        case 32:
        case 160:
          ++this.pos;
          break;
        case 13:
          if (this.input.charCodeAt(this.pos + 1) === 10) {
            ++this.pos;
          }
        case 10:
        case 8232:
        case 8233:
          ++this.pos;
          if (this.options.locations) {
            ++this.curLine;
            this.lineStart = this.pos;
          }
          break;
        case 47:
          switch (this.input.charCodeAt(this.pos + 1)) {
            case 42:
              this.skipBlockComment();
              break;
            case 47:
              this.skipLineComment(2);
              break;
            default:
              break loop;
          }
          break;
        default:
          if (ch > 8 && ch < 14 || ch >= 5760 && nonASCIIwhitespace.test(String.fromCharCode(ch))) {
            ++this.pos;
          } else {
            break loop;
          }
      }
    }
  };
  pp.finishToken = function(type, val) {
    this.end = this.pos;
    if (this.options.locations) {
      this.endLoc = this.curPosition();
    }
    var prevType = this.type;
    this.type = type;
    this.value = val;
    this.updateContext(prevType);
  };
  pp.readToken_dot = function() {
    var next2 = this.input.charCodeAt(this.pos + 1);
    if (next2 >= 48 && next2 <= 57) {
      return this.readNumber(true);
    }
    var next22 = this.input.charCodeAt(this.pos + 2);
    if (this.options.ecmaVersion >= 6 && next2 === 46 && next22 === 46) {
      this.pos += 3;
      return this.finishToken(types$1.ellipsis);
    } else {
      ++this.pos;
      return this.finishToken(types$1.dot);
    }
  };
  pp.readToken_slash = function() {
    var next2 = this.input.charCodeAt(this.pos + 1);
    if (this.exprAllowed) {
      ++this.pos;
      return this.readRegexp();
    }
    if (next2 === 61) {
      return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(types$1.slash, 1);
  };
  pp.readToken_mult_modulo_exp = function(code) {
    var next2 = this.input.charCodeAt(this.pos + 1);
    var size = 1;
    var tokentype = code === 42 ? types$1.star : types$1.modulo;
    if (this.options.ecmaVersion >= 7 && code === 42 && next2 === 42) {
      ++size;
      tokentype = types$1.starstar;
      next2 = this.input.charCodeAt(this.pos + 2);
    }
    if (next2 === 61) {
      return this.finishOp(types$1.assign, size + 1);
    }
    return this.finishOp(tokentype, size);
  };
  pp.readToken_pipe_amp = function(code) {
    var next2 = this.input.charCodeAt(this.pos + 1);
    if (next2 === code) {
      if (this.options.ecmaVersion >= 12) {
        var next22 = this.input.charCodeAt(this.pos + 2);
        if (next22 === 61) {
          return this.finishOp(types$1.assign, 3);
        }
      }
      return this.finishOp(code === 124 ? types$1.logicalOR : types$1.logicalAND, 2);
    }
    if (next2 === 61) {
      return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(code === 124 ? types$1.bitwiseOR : types$1.bitwiseAND, 1);
  };
  pp.readToken_caret = function() {
    var next2 = this.input.charCodeAt(this.pos + 1);
    if (next2 === 61) {
      return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(types$1.bitwiseXOR, 1);
  };
  pp.readToken_plus_min = function(code) {
    var next2 = this.input.charCodeAt(this.pos + 1);
    if (next2 === code) {
      if (next2 === 45 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 62 && (this.lastTokEnd === 0 || lineBreak.test(this.input.slice(this.lastTokEnd, this.pos)))) {
        this.skipLineComment(3);
        this.skipSpace();
        return this.nextToken();
      }
      return this.finishOp(types$1.incDec, 2);
    }
    if (next2 === 61) {
      return this.finishOp(types$1.assign, 2);
    }
    return this.finishOp(types$1.plusMin, 1);
  };
  pp.readToken_lt_gt = function(code) {
    var next2 = this.input.charCodeAt(this.pos + 1);
    var size = 1;
    if (next2 === code) {
      size = code === 62 && this.input.charCodeAt(this.pos + 2) === 62 ? 3 : 2;
      if (this.input.charCodeAt(this.pos + size) === 61) {
        return this.finishOp(types$1.assign, size + 1);
      }
      return this.finishOp(types$1.bitShift, size);
    }
    if (next2 === 33 && code === 60 && !this.inModule && this.input.charCodeAt(this.pos + 2) === 45 && this.input.charCodeAt(this.pos + 3) === 45) {
      this.skipLineComment(4);
      this.skipSpace();
      return this.nextToken();
    }
    if (next2 === 61) {
      size = 2;
    }
    return this.finishOp(types$1.relational, size);
  };
  pp.readToken_eq_excl = function(code) {
    var next2 = this.input.charCodeAt(this.pos + 1);
    if (next2 === 61) {
      return this.finishOp(types$1.equality, this.input.charCodeAt(this.pos + 2) === 61 ? 3 : 2);
    }
    if (code === 61 && next2 === 62 && this.options.ecmaVersion >= 6) {
      this.pos += 2;
      return this.finishToken(types$1.arrow);
    }
    return this.finishOp(code === 61 ? types$1.eq : types$1.prefix, 1);
  };
  pp.readToken_question = function() {
    var ecmaVersion = this.options.ecmaVersion;
    if (ecmaVersion >= 11) {
      var next2 = this.input.charCodeAt(this.pos + 1);
      if (next2 === 46) {
        var next22 = this.input.charCodeAt(this.pos + 2);
        if (next22 < 48 || next22 > 57) {
          return this.finishOp(types$1.questionDot, 2);
        }
      }
      if (next2 === 63) {
        if (ecmaVersion >= 12) {
          var next2$1 = this.input.charCodeAt(this.pos + 2);
          if (next2$1 === 61) {
            return this.finishOp(types$1.assign, 3);
          }
        }
        return this.finishOp(types$1.coalesce, 2);
      }
    }
    return this.finishOp(types$1.question, 1);
  };
  pp.readToken_numberSign = function() {
    var ecmaVersion = this.options.ecmaVersion;
    var code = 35;
    if (ecmaVersion >= 13) {
      ++this.pos;
      code = this.fullCharCodeAtPos();
      if (isIdentifierStart(code, true) || code === 92) {
        return this.finishToken(types$1.privateId, this.readWord1());
      }
    }
    this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
  };
  pp.getTokenFromCode = function(code) {
    switch (code) {
      // The interpretation of a dot depends on whether it is followed
      // by a digit or another two dots.
      case 46:
        return this.readToken_dot();
      // Punctuation tokens.
      case 40:
        ++this.pos;
        return this.finishToken(types$1.parenL);
      case 41:
        ++this.pos;
        return this.finishToken(types$1.parenR);
      case 59:
        ++this.pos;
        return this.finishToken(types$1.semi);
      case 44:
        ++this.pos;
        return this.finishToken(types$1.comma);
      case 91:
        ++this.pos;
        return this.finishToken(types$1.bracketL);
      case 93:
        ++this.pos;
        return this.finishToken(types$1.bracketR);
      case 123:
        ++this.pos;
        return this.finishToken(types$1.braceL);
      case 125:
        ++this.pos;
        return this.finishToken(types$1.braceR);
      case 58:
        ++this.pos;
        return this.finishToken(types$1.colon);
      case 96:
        if (this.options.ecmaVersion < 6) {
          break;
        }
        ++this.pos;
        return this.finishToken(types$1.backQuote);
      case 48:
        var next2 = this.input.charCodeAt(this.pos + 1);
        if (next2 === 120 || next2 === 88) {
          return this.readRadixNumber(16);
        }
        if (this.options.ecmaVersion >= 6) {
          if (next2 === 111 || next2 === 79) {
            return this.readRadixNumber(8);
          }
          if (next2 === 98 || next2 === 66) {
            return this.readRadixNumber(2);
          }
        }
      // Anything else beginning with a digit is an integer, octal
      // number, or float.
      case 49:
      case 50:
      case 51:
      case 52:
      case 53:
      case 54:
      case 55:
      case 56:
      case 57:
        return this.readNumber(false);
      // Quotes produce strings.
      case 34:
      case 39:
        return this.readString(code);
      // Operators are parsed inline in tiny state machines. '=' (61) is
      // often referred to. `finishOp` simply skips the amount of
      // characters it is given as second argument, and returns a token
      // of the type given by its first argument.
      case 47:
        return this.readToken_slash();
      case 37:
      case 42:
        return this.readToken_mult_modulo_exp(code);
      case 124:
      case 38:
        return this.readToken_pipe_amp(code);
      case 94:
        return this.readToken_caret();
      case 43:
      case 45:
        return this.readToken_plus_min(code);
      case 60:
      case 62:
        return this.readToken_lt_gt(code);
      case 61:
      case 33:
        return this.readToken_eq_excl(code);
      case 63:
        return this.readToken_question();
      case 126:
        return this.finishOp(types$1.prefix, 1);
      case 35:
        return this.readToken_numberSign();
    }
    this.raise(this.pos, "Unexpected character '" + codePointToString(code) + "'");
  };
  pp.finishOp = function(type, size) {
    var str = this.input.slice(this.pos, this.pos + size);
    this.pos += size;
    return this.finishToken(type, str);
  };
  pp.readRegexp = function() {
    var escaped, inClass, start = this.pos;
    for (; ; ) {
      if (this.pos >= this.input.length) {
        this.raise(start, "Unterminated regular expression");
      }
      var ch = this.input.charAt(this.pos);
      if (lineBreak.test(ch)) {
        this.raise(start, "Unterminated regular expression");
      }
      if (!escaped) {
        if (ch === "[") {
          inClass = true;
        } else if (ch === "]" && inClass) {
          inClass = false;
        } else if (ch === "/" && !inClass) {
          break;
        }
        escaped = ch === "\\";
      } else {
        escaped = false;
      }
      ++this.pos;
    }
    var pattern = this.input.slice(start, this.pos);
    ++this.pos;
    var flagsStart = this.pos;
    var flags = this.readWord1();
    if (this.containsEsc) {
      this.unexpected(flagsStart);
    }
    var state2 = this.regexpState || (this.regexpState = new RegExpValidationState(this));
    state2.reset(start, pattern, flags);
    this.validateRegExpFlags(state2);
    this.validateRegExpPattern(state2);
    var value = null;
    try {
      value = new RegExp(pattern, flags);
    } catch (e) {
    }
    return this.finishToken(types$1.regexp, { pattern, flags, value });
  };
  pp.readInt = function(radix, len, maybeLegacyOctalNumericLiteral) {
    var allowSeparators = this.options.ecmaVersion >= 12 && len === void 0;
    var isLegacyOctalNumericLiteral = maybeLegacyOctalNumericLiteral && this.input.charCodeAt(this.pos) === 48;
    var start = this.pos, total = 0, lastCode = 0;
    for (var i = 0, e = len == null ? Infinity : len; i < e; ++i, ++this.pos) {
      var code = this.input.charCodeAt(this.pos), val = void 0;
      if (allowSeparators && code === 95) {
        if (isLegacyOctalNumericLiteral) {
          this.raiseRecoverable(this.pos, "Numeric separator is not allowed in legacy octal numeric literals");
        }
        if (lastCode === 95) {
          this.raiseRecoverable(this.pos, "Numeric separator must be exactly one underscore");
        }
        if (i === 0) {
          this.raiseRecoverable(this.pos, "Numeric separator is not allowed at the first of digits");
        }
        lastCode = code;
        continue;
      }
      if (code >= 97) {
        val = code - 97 + 10;
      } else if (code >= 65) {
        val = code - 65 + 10;
      } else if (code >= 48 && code <= 57) {
        val = code - 48;
      } else {
        val = Infinity;
      }
      if (val >= radix) {
        break;
      }
      lastCode = code;
      total = total * radix + val;
    }
    if (allowSeparators && lastCode === 95) {
      this.raiseRecoverable(this.pos - 1, "Numeric separator is not allowed at the last of digits");
    }
    if (this.pos === start || len != null && this.pos - start !== len) {
      return null;
    }
    return total;
  };
  function stringToNumber(str, isLegacyOctalNumericLiteral) {
    if (isLegacyOctalNumericLiteral) {
      return parseInt(str, 8);
    }
    return parseFloat(str.replace(/_/g, ""));
  }
  function stringToBigInt(str) {
    if (typeof BigInt !== "function") {
      return null;
    }
    return BigInt(str.replace(/_/g, ""));
  }
  pp.readRadixNumber = function(radix) {
    var start = this.pos;
    this.pos += 2;
    var val = this.readInt(radix);
    if (val == null) {
      this.raise(this.start + 2, "Expected number in radix " + radix);
    }
    if (this.options.ecmaVersion >= 11 && this.input.charCodeAt(this.pos) === 110) {
      val = stringToBigInt(this.input.slice(start, this.pos));
      ++this.pos;
    } else if (isIdentifierStart(this.fullCharCodeAtPos())) {
      this.raise(this.pos, "Identifier directly after number");
    }
    return this.finishToken(types$1.num, val);
  };
  pp.readNumber = function(startsWithDot) {
    var start = this.pos;
    if (!startsWithDot && this.readInt(10, void 0, true) === null) {
      this.raise(start, "Invalid number");
    }
    var octal = this.pos - start >= 2 && this.input.charCodeAt(start) === 48;
    if (octal && this.strict) {
      this.raise(start, "Invalid number");
    }
    var next2 = this.input.charCodeAt(this.pos);
    if (!octal && !startsWithDot && this.options.ecmaVersion >= 11 && next2 === 110) {
      var val$1 = stringToBigInt(this.input.slice(start, this.pos));
      ++this.pos;
      if (isIdentifierStart(this.fullCharCodeAtPos())) {
        this.raise(this.pos, "Identifier directly after number");
      }
      return this.finishToken(types$1.num, val$1);
    }
    if (octal && /[89]/.test(this.input.slice(start, this.pos))) {
      octal = false;
    }
    if (next2 === 46 && !octal) {
      ++this.pos;
      this.readInt(10);
      next2 = this.input.charCodeAt(this.pos);
    }
    if ((next2 === 69 || next2 === 101) && !octal) {
      next2 = this.input.charCodeAt(++this.pos);
      if (next2 === 43 || next2 === 45) {
        ++this.pos;
      }
      if (this.readInt(10) === null) {
        this.raise(start, "Invalid number");
      }
    }
    if (isIdentifierStart(this.fullCharCodeAtPos())) {
      this.raise(this.pos, "Identifier directly after number");
    }
    var val = stringToNumber(this.input.slice(start, this.pos), octal);
    return this.finishToken(types$1.num, val);
  };
  pp.readCodePoint = function() {
    var ch = this.input.charCodeAt(this.pos), code;
    if (ch === 123) {
      if (this.options.ecmaVersion < 6) {
        this.unexpected();
      }
      var codePos = ++this.pos;
      code = this.readHexChar(this.input.indexOf("}", this.pos) - this.pos);
      ++this.pos;
      if (code > 1114111) {
        this.invalidStringToken(codePos, "Code point out of bounds");
      }
    } else {
      code = this.readHexChar(4);
    }
    return code;
  };
  pp.readString = function(quote) {
    var out = "", chunkStart = ++this.pos;
    for (; ; ) {
      if (this.pos >= this.input.length) {
        this.raise(this.start, "Unterminated string constant");
      }
      var ch = this.input.charCodeAt(this.pos);
      if (ch === quote) {
        break;
      }
      if (ch === 92) {
        out += this.input.slice(chunkStart, this.pos);
        out += this.readEscapedChar(false);
        chunkStart = this.pos;
      } else if (ch === 8232 || ch === 8233) {
        if (this.options.ecmaVersion < 10) {
          this.raise(this.start, "Unterminated string constant");
        }
        ++this.pos;
        if (this.options.locations) {
          this.curLine++;
          this.lineStart = this.pos;
        }
      } else {
        if (isNewLine(ch)) {
          this.raise(this.start, "Unterminated string constant");
        }
        ++this.pos;
      }
    }
    out += this.input.slice(chunkStart, this.pos++);
    return this.finishToken(types$1.string, out);
  };
  var INVALID_TEMPLATE_ESCAPE_ERROR = {};
  pp.tryReadTemplateToken = function() {
    this.inTemplateElement = true;
    try {
      this.readTmplToken();
    } catch (err) {
      if (err === INVALID_TEMPLATE_ESCAPE_ERROR) {
        this.readInvalidTemplateToken();
      } else {
        throw err;
      }
    }
    this.inTemplateElement = false;
  };
  pp.invalidStringToken = function(position, message) {
    if (this.inTemplateElement && this.options.ecmaVersion >= 9) {
      throw INVALID_TEMPLATE_ESCAPE_ERROR;
    } else {
      this.raise(position, message);
    }
  };
  pp.readTmplToken = function() {
    var out = "", chunkStart = this.pos;
    for (; ; ) {
      if (this.pos >= this.input.length) {
        this.raise(this.start, "Unterminated template");
      }
      var ch = this.input.charCodeAt(this.pos);
      if (ch === 96 || ch === 36 && this.input.charCodeAt(this.pos + 1) === 123) {
        if (this.pos === this.start && (this.type === types$1.template || this.type === types$1.invalidTemplate)) {
          if (ch === 36) {
            this.pos += 2;
            return this.finishToken(types$1.dollarBraceL);
          } else {
            ++this.pos;
            return this.finishToken(types$1.backQuote);
          }
        }
        out += this.input.slice(chunkStart, this.pos);
        return this.finishToken(types$1.template, out);
      }
      if (ch === 92) {
        out += this.input.slice(chunkStart, this.pos);
        out += this.readEscapedChar(true);
        chunkStart = this.pos;
      } else if (isNewLine(ch)) {
        out += this.input.slice(chunkStart, this.pos);
        ++this.pos;
        switch (ch) {
          case 13:
            if (this.input.charCodeAt(this.pos) === 10) {
              ++this.pos;
            }
          case 10:
            out += "\n";
            break;
          default:
            out += String.fromCharCode(ch);
            break;
        }
        if (this.options.locations) {
          ++this.curLine;
          this.lineStart = this.pos;
        }
        chunkStart = this.pos;
      } else {
        ++this.pos;
      }
    }
  };
  pp.readInvalidTemplateToken = function() {
    for (; this.pos < this.input.length; this.pos++) {
      switch (this.input[this.pos]) {
        case "\\":
          ++this.pos;
          break;
        case "$":
          if (this.input[this.pos + 1] !== "{") {
            break;
          }
        // fall through
        case "`":
          return this.finishToken(types$1.invalidTemplate, this.input.slice(this.start, this.pos));
        case "\r":
          if (this.input[this.pos + 1] === "\n") {
            ++this.pos;
          }
        // fall through
        case "\n":
        case "\u2028":
        case "\u2029":
          ++this.curLine;
          this.lineStart = this.pos + 1;
          break;
      }
    }
    this.raise(this.start, "Unterminated template");
  };
  pp.readEscapedChar = function(inTemplate) {
    var ch = this.input.charCodeAt(++this.pos);
    ++this.pos;
    switch (ch) {
      case 110:
        return "\n";
      // 'n' -> '\n'
      case 114:
        return "\r";
      // 'r' -> '\r'
      case 120:
        return String.fromCharCode(this.readHexChar(2));
      // 'x'
      case 117:
        return codePointToString(this.readCodePoint());
      // 'u'
      case 116:
        return "	";
      // 't' -> '\t'
      case 98:
        return "\b";
      // 'b' -> '\b'
      case 118:
        return "\v";
      // 'v' -> '\u000b'
      case 102:
        return "\f";
      // 'f' -> '\f'
      case 13:
        if (this.input.charCodeAt(this.pos) === 10) {
          ++this.pos;
        }
      // '\r\n'
      case 10:
        if (this.options.locations) {
          this.lineStart = this.pos;
          ++this.curLine;
        }
        return "";
      case 56:
      case 57:
        if (this.strict) {
          this.invalidStringToken(
            this.pos - 1,
            "Invalid escape sequence"
          );
        }
        if (inTemplate) {
          var codePos = this.pos - 1;
          this.invalidStringToken(
            codePos,
            "Invalid escape sequence in template string"
          );
        }
      default:
        if (ch >= 48 && ch <= 55) {
          var octalStr = this.input.substr(this.pos - 1, 3).match(/^[0-7]+/)[0];
          var octal = parseInt(octalStr, 8);
          if (octal > 255) {
            octalStr = octalStr.slice(0, -1);
            octal = parseInt(octalStr, 8);
          }
          this.pos += octalStr.length - 1;
          ch = this.input.charCodeAt(this.pos);
          if ((octalStr !== "0" || ch === 56 || ch === 57) && (this.strict || inTemplate)) {
            this.invalidStringToken(
              this.pos - 1 - octalStr.length,
              inTemplate ? "Octal literal in template string" : "Octal literal in strict mode"
            );
          }
          return String.fromCharCode(octal);
        }
        if (isNewLine(ch)) {
          if (this.options.locations) {
            this.lineStart = this.pos;
            ++this.curLine;
          }
          return "";
        }
        return String.fromCharCode(ch);
    }
  };
  pp.readHexChar = function(len) {
    var codePos = this.pos;
    var n = this.readInt(16, len);
    if (n === null) {
      this.invalidStringToken(codePos, "Bad character escape sequence");
    }
    return n;
  };
  pp.readWord1 = function() {
    this.containsEsc = false;
    var word = "", first = true, chunkStart = this.pos;
    var astral = this.options.ecmaVersion >= 6;
    while (this.pos < this.input.length) {
      var ch = this.fullCharCodeAtPos();
      if (isIdentifierChar(ch, astral)) {
        this.pos += ch <= 65535 ? 1 : 2;
      } else if (ch === 92) {
        this.containsEsc = true;
        word += this.input.slice(chunkStart, this.pos);
        var escStart = this.pos;
        if (this.input.charCodeAt(++this.pos) !== 117) {
          this.invalidStringToken(this.pos, "Expecting Unicode escape sequence \\uXXXX");
        }
        ++this.pos;
        var esc = this.readCodePoint();
        if (!(first ? isIdentifierStart : isIdentifierChar)(esc, astral)) {
          this.invalidStringToken(escStart, "Invalid Unicode escape");
        }
        word += codePointToString(esc);
        chunkStart = this.pos;
      } else {
        break;
      }
      first = false;
    }
    return word + this.input.slice(chunkStart, this.pos);
  };
  pp.readWord = function() {
    var word = this.readWord1();
    var type = types$1.name;
    if (this.keywords.test(word)) {
      type = keywords[word];
    }
    return this.finishToken(type, word);
  };
  var version = "8.19.0";
  Parser.acorn = {
    Parser,
    version,
    defaultOptions,
    Position,
    SourceLocation,
    getLineInfo,
    Node,
    TokenType,
    tokTypes: types$1,
    keywordTypes: keywords,
    TokContext,
    tokContexts: types,
    isIdentifierChar,
    isIdentifierStart,
    Token,
    isNewLine,
    lineBreak,
    lineBreakG,
    nonASCIIwhitespace
  };
  function parse3(input2, options) {
    return Parser.parse(input2, options);
  }

  // node_modules/sucrase/dist/esm/parser/tokenizer/keywords.js
  var ContextualKeyword;
  (function(ContextualKeyword2) {
    const NONE = 0;
    ContextualKeyword2[ContextualKeyword2["NONE"] = NONE] = "NONE";
    const _abstract = NONE + 1;
    ContextualKeyword2[ContextualKeyword2["_abstract"] = _abstract] = "_abstract";
    const _accessor = _abstract + 1;
    ContextualKeyword2[ContextualKeyword2["_accessor"] = _accessor] = "_accessor";
    const _as = _accessor + 1;
    ContextualKeyword2[ContextualKeyword2["_as"] = _as] = "_as";
    const _assert = _as + 1;
    ContextualKeyword2[ContextualKeyword2["_assert"] = _assert] = "_assert";
    const _asserts = _assert + 1;
    ContextualKeyword2[ContextualKeyword2["_asserts"] = _asserts] = "_asserts";
    const _async = _asserts + 1;
    ContextualKeyword2[ContextualKeyword2["_async"] = _async] = "_async";
    const _await = _async + 1;
    ContextualKeyword2[ContextualKeyword2["_await"] = _await] = "_await";
    const _checks = _await + 1;
    ContextualKeyword2[ContextualKeyword2["_checks"] = _checks] = "_checks";
    const _constructor = _checks + 1;
    ContextualKeyword2[ContextualKeyword2["_constructor"] = _constructor] = "_constructor";
    const _declare = _constructor + 1;
    ContextualKeyword2[ContextualKeyword2["_declare"] = _declare] = "_declare";
    const _enum = _declare + 1;
    ContextualKeyword2[ContextualKeyword2["_enum"] = _enum] = "_enum";
    const _exports = _enum + 1;
    ContextualKeyword2[ContextualKeyword2["_exports"] = _exports] = "_exports";
    const _from = _exports + 1;
    ContextualKeyword2[ContextualKeyword2["_from"] = _from] = "_from";
    const _get = _from + 1;
    ContextualKeyword2[ContextualKeyword2["_get"] = _get] = "_get";
    const _global = _get + 1;
    ContextualKeyword2[ContextualKeyword2["_global"] = _global] = "_global";
    const _implements = _global + 1;
    ContextualKeyword2[ContextualKeyword2["_implements"] = _implements] = "_implements";
    const _infer = _implements + 1;
    ContextualKeyword2[ContextualKeyword2["_infer"] = _infer] = "_infer";
    const _interface = _infer + 1;
    ContextualKeyword2[ContextualKeyword2["_interface"] = _interface] = "_interface";
    const _is = _interface + 1;
    ContextualKeyword2[ContextualKeyword2["_is"] = _is] = "_is";
    const _keyof = _is + 1;
    ContextualKeyword2[ContextualKeyword2["_keyof"] = _keyof] = "_keyof";
    const _mixins = _keyof + 1;
    ContextualKeyword2[ContextualKeyword2["_mixins"] = _mixins] = "_mixins";
    const _module = _mixins + 1;
    ContextualKeyword2[ContextualKeyword2["_module"] = _module] = "_module";
    const _namespace = _module + 1;
    ContextualKeyword2[ContextualKeyword2["_namespace"] = _namespace] = "_namespace";
    const _of = _namespace + 1;
    ContextualKeyword2[ContextualKeyword2["_of"] = _of] = "_of";
    const _opaque = _of + 1;
    ContextualKeyword2[ContextualKeyword2["_opaque"] = _opaque] = "_opaque";
    const _out = _opaque + 1;
    ContextualKeyword2[ContextualKeyword2["_out"] = _out] = "_out";
    const _override = _out + 1;
    ContextualKeyword2[ContextualKeyword2["_override"] = _override] = "_override";
    const _private = _override + 1;
    ContextualKeyword2[ContextualKeyword2["_private"] = _private] = "_private";
    const _protected = _private + 1;
    ContextualKeyword2[ContextualKeyword2["_protected"] = _protected] = "_protected";
    const _proto = _protected + 1;
    ContextualKeyword2[ContextualKeyword2["_proto"] = _proto] = "_proto";
    const _public = _proto + 1;
    ContextualKeyword2[ContextualKeyword2["_public"] = _public] = "_public";
    const _readonly = _public + 1;
    ContextualKeyword2[ContextualKeyword2["_readonly"] = _readonly] = "_readonly";
    const _require = _readonly + 1;
    ContextualKeyword2[ContextualKeyword2["_require"] = _require] = "_require";
    const _satisfies = _require + 1;
    ContextualKeyword2[ContextualKeyword2["_satisfies"] = _satisfies] = "_satisfies";
    const _set = _satisfies + 1;
    ContextualKeyword2[ContextualKeyword2["_set"] = _set] = "_set";
    const _static = _set + 1;
    ContextualKeyword2[ContextualKeyword2["_static"] = _static] = "_static";
    const _symbol = _static + 1;
    ContextualKeyword2[ContextualKeyword2["_symbol"] = _symbol] = "_symbol";
    const _type = _symbol + 1;
    ContextualKeyword2[ContextualKeyword2["_type"] = _type] = "_type";
    const _unique = _type + 1;
    ContextualKeyword2[ContextualKeyword2["_unique"] = _unique] = "_unique";
    const _using = _unique + 1;
    ContextualKeyword2[ContextualKeyword2["_using"] = _using] = "_using";
  })(ContextualKeyword || (ContextualKeyword = {}));

  // node_modules/sucrase/dist/esm/parser/tokenizer/types.js
  var TokenType3;
  (function(TokenType4) {
    const PRECEDENCE_MASK = 15;
    TokenType4[TokenType4["PRECEDENCE_MASK"] = PRECEDENCE_MASK] = "PRECEDENCE_MASK";
    const IS_KEYWORD = 1 << 4;
    TokenType4[TokenType4["IS_KEYWORD"] = IS_KEYWORD] = "IS_KEYWORD";
    const IS_ASSIGN = 1 << 5;
    TokenType4[TokenType4["IS_ASSIGN"] = IS_ASSIGN] = "IS_ASSIGN";
    const IS_RIGHT_ASSOCIATIVE = 1 << 6;
    TokenType4[TokenType4["IS_RIGHT_ASSOCIATIVE"] = IS_RIGHT_ASSOCIATIVE] = "IS_RIGHT_ASSOCIATIVE";
    const IS_PREFIX = 1 << 7;
    TokenType4[TokenType4["IS_PREFIX"] = IS_PREFIX] = "IS_PREFIX";
    const IS_POSTFIX = 1 << 8;
    TokenType4[TokenType4["IS_POSTFIX"] = IS_POSTFIX] = "IS_POSTFIX";
    const IS_EXPRESSION_START = 1 << 9;
    TokenType4[TokenType4["IS_EXPRESSION_START"] = IS_EXPRESSION_START] = "IS_EXPRESSION_START";
    const num = 512;
    TokenType4[TokenType4["num"] = num] = "num";
    const bigint = 1536;
    TokenType4[TokenType4["bigint"] = bigint] = "bigint";
    const decimal = 2560;
    TokenType4[TokenType4["decimal"] = decimal] = "decimal";
    const regexp = 3584;
    TokenType4[TokenType4["regexp"] = regexp] = "regexp";
    const string = 4608;
    TokenType4[TokenType4["string"] = string] = "string";
    const name = 5632;
    TokenType4[TokenType4["name"] = name] = "name";
    const eof = 6144;
    TokenType4[TokenType4["eof"] = eof] = "eof";
    const bracketL = 7680;
    TokenType4[TokenType4["bracketL"] = bracketL] = "bracketL";
    const bracketR = 8192;
    TokenType4[TokenType4["bracketR"] = bracketR] = "bracketR";
    const braceL = 9728;
    TokenType4[TokenType4["braceL"] = braceL] = "braceL";
    const braceBarL = 10752;
    TokenType4[TokenType4["braceBarL"] = braceBarL] = "braceBarL";
    const braceR = 11264;
    TokenType4[TokenType4["braceR"] = braceR] = "braceR";
    const braceBarR = 12288;
    TokenType4[TokenType4["braceBarR"] = braceBarR] = "braceBarR";
    const parenL = 13824;
    TokenType4[TokenType4["parenL"] = parenL] = "parenL";
    const parenR = 14336;
    TokenType4[TokenType4["parenR"] = parenR] = "parenR";
    const comma2 = 15360;
    TokenType4[TokenType4["comma"] = comma2] = "comma";
    const semi = 16384;
    TokenType4[TokenType4["semi"] = semi] = "semi";
    const colon = 17408;
    TokenType4[TokenType4["colon"] = colon] = "colon";
    const doubleColon = 18432;
    TokenType4[TokenType4["doubleColon"] = doubleColon] = "doubleColon";
    const dot = 19456;
    TokenType4[TokenType4["dot"] = dot] = "dot";
    const question = 20480;
    TokenType4[TokenType4["question"] = question] = "question";
    const questionDot = 21504;
    TokenType4[TokenType4["questionDot"] = questionDot] = "questionDot";
    const arrow = 22528;
    TokenType4[TokenType4["arrow"] = arrow] = "arrow";
    const template = 23552;
    TokenType4[TokenType4["template"] = template] = "template";
    const ellipsis = 24576;
    TokenType4[TokenType4["ellipsis"] = ellipsis] = "ellipsis";
    const backQuote = 25600;
    TokenType4[TokenType4["backQuote"] = backQuote] = "backQuote";
    const dollarBraceL = 27136;
    TokenType4[TokenType4["dollarBraceL"] = dollarBraceL] = "dollarBraceL";
    const at2 = 27648;
    TokenType4[TokenType4["at"] = at2] = "at";
    const hash = 29184;
    TokenType4[TokenType4["hash"] = hash] = "hash";
    const eq = 29728;
    TokenType4[TokenType4["eq"] = eq] = "eq";
    const assign = 30752;
    TokenType4[TokenType4["assign"] = assign] = "assign";
    const preIncDec = 32640;
    TokenType4[TokenType4["preIncDec"] = preIncDec] = "preIncDec";
    const postIncDec = 33664;
    TokenType4[TokenType4["postIncDec"] = postIncDec] = "postIncDec";
    const bang = 34432;
    TokenType4[TokenType4["bang"] = bang] = "bang";
    const tilde = 35456;
    TokenType4[TokenType4["tilde"] = tilde] = "tilde";
    const pipeline = 35841;
    TokenType4[TokenType4["pipeline"] = pipeline] = "pipeline";
    const nullishCoalescing = 36866;
    TokenType4[TokenType4["nullishCoalescing"] = nullishCoalescing] = "nullishCoalescing";
    const logicalOR = 37890;
    TokenType4[TokenType4["logicalOR"] = logicalOR] = "logicalOR";
    const logicalAND = 38915;
    TokenType4[TokenType4["logicalAND"] = logicalAND] = "logicalAND";
    const bitwiseOR = 39940;
    TokenType4[TokenType4["bitwiseOR"] = bitwiseOR] = "bitwiseOR";
    const bitwiseXOR = 40965;
    TokenType4[TokenType4["bitwiseXOR"] = bitwiseXOR] = "bitwiseXOR";
    const bitwiseAND = 41990;
    TokenType4[TokenType4["bitwiseAND"] = bitwiseAND] = "bitwiseAND";
    const equality = 43015;
    TokenType4[TokenType4["equality"] = equality] = "equality";
    const lessThan = 44040;
    TokenType4[TokenType4["lessThan"] = lessThan] = "lessThan";
    const greaterThan = 45064;
    TokenType4[TokenType4["greaterThan"] = greaterThan] = "greaterThan";
    const relationalOrEqual = 46088;
    TokenType4[TokenType4["relationalOrEqual"] = relationalOrEqual] = "relationalOrEqual";
    const bitShiftL = 47113;
    TokenType4[TokenType4["bitShiftL"] = bitShiftL] = "bitShiftL";
    const bitShiftR = 48137;
    TokenType4[TokenType4["bitShiftR"] = bitShiftR] = "bitShiftR";
    const plus = 49802;
    TokenType4[TokenType4["plus"] = plus] = "plus";
    const minus = 50826;
    TokenType4[TokenType4["minus"] = minus] = "minus";
    const modulo = 51723;
    TokenType4[TokenType4["modulo"] = modulo] = "modulo";
    const star = 52235;
    TokenType4[TokenType4["star"] = star] = "star";
    const slash = 53259;
    TokenType4[TokenType4["slash"] = slash] = "slash";
    const exponent = 54348;
    TokenType4[TokenType4["exponent"] = exponent] = "exponent";
    const jsxName = 55296;
    TokenType4[TokenType4["jsxName"] = jsxName] = "jsxName";
    const jsxText = 56320;
    TokenType4[TokenType4["jsxText"] = jsxText] = "jsxText";
    const jsxEmptyText = 57344;
    TokenType4[TokenType4["jsxEmptyText"] = jsxEmptyText] = "jsxEmptyText";
    const jsxTagStart = 58880;
    TokenType4[TokenType4["jsxTagStart"] = jsxTagStart] = "jsxTagStart";
    const jsxTagEnd = 59392;
    TokenType4[TokenType4["jsxTagEnd"] = jsxTagEnd] = "jsxTagEnd";
    const typeParameterStart = 60928;
    TokenType4[TokenType4["typeParameterStart"] = typeParameterStart] = "typeParameterStart";
    const nonNullAssertion = 61440;
    TokenType4[TokenType4["nonNullAssertion"] = nonNullAssertion] = "nonNullAssertion";
    const _break = 62480;
    TokenType4[TokenType4["_break"] = _break] = "_break";
    const _case = 63504;
    TokenType4[TokenType4["_case"] = _case] = "_case";
    const _catch = 64528;
    TokenType4[TokenType4["_catch"] = _catch] = "_catch";
    const _continue = 65552;
    TokenType4[TokenType4["_continue"] = _continue] = "_continue";
    const _debugger = 66576;
    TokenType4[TokenType4["_debugger"] = _debugger] = "_debugger";
    const _default = 67600;
    TokenType4[TokenType4["_default"] = _default] = "_default";
    const _do = 68624;
    TokenType4[TokenType4["_do"] = _do] = "_do";
    const _else = 69648;
    TokenType4[TokenType4["_else"] = _else] = "_else";
    const _finally = 70672;
    TokenType4[TokenType4["_finally"] = _finally] = "_finally";
    const _for = 71696;
    TokenType4[TokenType4["_for"] = _for] = "_for";
    const _function = 73232;
    TokenType4[TokenType4["_function"] = _function] = "_function";
    const _if = 73744;
    TokenType4[TokenType4["_if"] = _if] = "_if";
    const _return = 74768;
    TokenType4[TokenType4["_return"] = _return] = "_return";
    const _switch = 75792;
    TokenType4[TokenType4["_switch"] = _switch] = "_switch";
    const _throw = 77456;
    TokenType4[TokenType4["_throw"] = _throw] = "_throw";
    const _try = 77840;
    TokenType4[TokenType4["_try"] = _try] = "_try";
    const _var = 78864;
    TokenType4[TokenType4["_var"] = _var] = "_var";
    const _let = 79888;
    TokenType4[TokenType4["_let"] = _let] = "_let";
    const _const = 80912;
    TokenType4[TokenType4["_const"] = _const] = "_const";
    const _while = 81936;
    TokenType4[TokenType4["_while"] = _while] = "_while";
    const _with = 82960;
    TokenType4[TokenType4["_with"] = _with] = "_with";
    const _new = 84496;
    TokenType4[TokenType4["_new"] = _new] = "_new";
    const _this = 85520;
    TokenType4[TokenType4["_this"] = _this] = "_this";
    const _super = 86544;
    TokenType4[TokenType4["_super"] = _super] = "_super";
    const _class = 87568;
    TokenType4[TokenType4["_class"] = _class] = "_class";
    const _extends = 88080;
    TokenType4[TokenType4["_extends"] = _extends] = "_extends";
    const _export = 89104;
    TokenType4[TokenType4["_export"] = _export] = "_export";
    const _import = 90640;
    TokenType4[TokenType4["_import"] = _import] = "_import";
    const _yield = 91664;
    TokenType4[TokenType4["_yield"] = _yield] = "_yield";
    const _null = 92688;
    TokenType4[TokenType4["_null"] = _null] = "_null";
    const _true = 93712;
    TokenType4[TokenType4["_true"] = _true] = "_true";
    const _false = 94736;
    TokenType4[TokenType4["_false"] = _false] = "_false";
    const _in = 95256;
    TokenType4[TokenType4["_in"] = _in] = "_in";
    const _instanceof = 96280;
    TokenType4[TokenType4["_instanceof"] = _instanceof] = "_instanceof";
    const _typeof = 97936;
    TokenType4[TokenType4["_typeof"] = _typeof] = "_typeof";
    const _void = 98960;
    TokenType4[TokenType4["_void"] = _void] = "_void";
    const _delete = 99984;
    TokenType4[TokenType4["_delete"] = _delete] = "_delete";
    const _async = 100880;
    TokenType4[TokenType4["_async"] = _async] = "_async";
    const _get = 101904;
    TokenType4[TokenType4["_get"] = _get] = "_get";
    const _set = 102928;
    TokenType4[TokenType4["_set"] = _set] = "_set";
    const _declare = 103952;
    TokenType4[TokenType4["_declare"] = _declare] = "_declare";
    const _readonly = 104976;
    TokenType4[TokenType4["_readonly"] = _readonly] = "_readonly";
    const _abstract = 106e3;
    TokenType4[TokenType4["_abstract"] = _abstract] = "_abstract";
    const _static = 107024;
    TokenType4[TokenType4["_static"] = _static] = "_static";
    const _public = 107536;
    TokenType4[TokenType4["_public"] = _public] = "_public";
    const _private = 108560;
    TokenType4[TokenType4["_private"] = _private] = "_private";
    const _protected = 109584;
    TokenType4[TokenType4["_protected"] = _protected] = "_protected";
    const _override = 110608;
    TokenType4[TokenType4["_override"] = _override] = "_override";
    const _as = 112144;
    TokenType4[TokenType4["_as"] = _as] = "_as";
    const _enum = 113168;
    TokenType4[TokenType4["_enum"] = _enum] = "_enum";
    const _type = 114192;
    TokenType4[TokenType4["_type"] = _type] = "_type";
    const _implements = 115216;
    TokenType4[TokenType4["_implements"] = _implements] = "_implements";
  })(TokenType3 || (TokenType3 = {}));
  function formatTokenType(tokenType) {
    switch (tokenType) {
      case TokenType3.num:
        return "num";
      case TokenType3.bigint:
        return "bigint";
      case TokenType3.decimal:
        return "decimal";
      case TokenType3.regexp:
        return "regexp";
      case TokenType3.string:
        return "string";
      case TokenType3.name:
        return "name";
      case TokenType3.eof:
        return "eof";
      case TokenType3.bracketL:
        return "[";
      case TokenType3.bracketR:
        return "]";
      case TokenType3.braceL:
        return "{";
      case TokenType3.braceBarL:
        return "{|";
      case TokenType3.braceR:
        return "}";
      case TokenType3.braceBarR:
        return "|}";
      case TokenType3.parenL:
        return "(";
      case TokenType3.parenR:
        return ")";
      case TokenType3.comma:
        return ",";
      case TokenType3.semi:
        return ";";
      case TokenType3.colon:
        return ":";
      case TokenType3.doubleColon:
        return "::";
      case TokenType3.dot:
        return ".";
      case TokenType3.question:
        return "?";
      case TokenType3.questionDot:
        return "?.";
      case TokenType3.arrow:
        return "=>";
      case TokenType3.template:
        return "template";
      case TokenType3.ellipsis:
        return "...";
      case TokenType3.backQuote:
        return "`";
      case TokenType3.dollarBraceL:
        return "${";
      case TokenType3.at:
        return "@";
      case TokenType3.hash:
        return "#";
      case TokenType3.eq:
        return "=";
      case TokenType3.assign:
        return "_=";
      case TokenType3.preIncDec:
        return "++/--";
      case TokenType3.postIncDec:
        return "++/--";
      case TokenType3.bang:
        return "!";
      case TokenType3.tilde:
        return "~";
      case TokenType3.pipeline:
        return "|>";
      case TokenType3.nullishCoalescing:
        return "??";
      case TokenType3.logicalOR:
        return "||";
      case TokenType3.logicalAND:
        return "&&";
      case TokenType3.bitwiseOR:
        return "|";
      case TokenType3.bitwiseXOR:
        return "^";
      case TokenType3.bitwiseAND:
        return "&";
      case TokenType3.equality:
        return "==/!=";
      case TokenType3.lessThan:
        return "<";
      case TokenType3.greaterThan:
        return ">";
      case TokenType3.relationalOrEqual:
        return "<=/>=";
      case TokenType3.bitShiftL:
        return "<<";
      case TokenType3.bitShiftR:
        return ">>/>>>";
      case TokenType3.plus:
        return "+";
      case TokenType3.minus:
        return "-";
      case TokenType3.modulo:
        return "%";
      case TokenType3.star:
        return "*";
      case TokenType3.slash:
        return "/";
      case TokenType3.exponent:
        return "**";
      case TokenType3.jsxName:
        return "jsxName";
      case TokenType3.jsxText:
        return "jsxText";
      case TokenType3.jsxEmptyText:
        return "jsxEmptyText";
      case TokenType3.jsxTagStart:
        return "jsxTagStart";
      case TokenType3.jsxTagEnd:
        return "jsxTagEnd";
      case TokenType3.typeParameterStart:
        return "typeParameterStart";
      case TokenType3.nonNullAssertion:
        return "nonNullAssertion";
      case TokenType3._break:
        return "break";
      case TokenType3._case:
        return "case";
      case TokenType3._catch:
        return "catch";
      case TokenType3._continue:
        return "continue";
      case TokenType3._debugger:
        return "debugger";
      case TokenType3._default:
        return "default";
      case TokenType3._do:
        return "do";
      case TokenType3._else:
        return "else";
      case TokenType3._finally:
        return "finally";
      case TokenType3._for:
        return "for";
      case TokenType3._function:
        return "function";
      case TokenType3._if:
        return "if";
      case TokenType3._return:
        return "return";
      case TokenType3._switch:
        return "switch";
      case TokenType3._throw:
        return "throw";
      case TokenType3._try:
        return "try";
      case TokenType3._var:
        return "var";
      case TokenType3._let:
        return "let";
      case TokenType3._const:
        return "const";
      case TokenType3._while:
        return "while";
      case TokenType3._with:
        return "with";
      case TokenType3._new:
        return "new";
      case TokenType3._this:
        return "this";
      case TokenType3._super:
        return "super";
      case TokenType3._class:
        return "class";
      case TokenType3._extends:
        return "extends";
      case TokenType3._export:
        return "export";
      case TokenType3._import:
        return "import";
      case TokenType3._yield:
        return "yield";
      case TokenType3._null:
        return "null";
      case TokenType3._true:
        return "true";
      case TokenType3._false:
        return "false";
      case TokenType3._in:
        return "in";
      case TokenType3._instanceof:
        return "instanceof";
      case TokenType3._typeof:
        return "typeof";
      case TokenType3._void:
        return "void";
      case TokenType3._delete:
        return "delete";
      case TokenType3._async:
        return "async";
      case TokenType3._get:
        return "get";
      case TokenType3._set:
        return "set";
      case TokenType3._declare:
        return "declare";
      case TokenType3._readonly:
        return "readonly";
      case TokenType3._abstract:
        return "abstract";
      case TokenType3._static:
        return "static";
      case TokenType3._public:
        return "public";
      case TokenType3._private:
        return "private";
      case TokenType3._protected:
        return "protected";
      case TokenType3._override:
        return "override";
      case TokenType3._as:
        return "as";
      case TokenType3._enum:
        return "enum";
      case TokenType3._type:
        return "type";
      case TokenType3._implements:
        return "implements";
      default:
        return "";
    }
  }

  // node_modules/sucrase/dist/esm/parser/tokenizer/state.js
  var Scope3 = class {
    constructor(startTokenIndex, endTokenIndex, isFunctionScope) {
      this.startTokenIndex = startTokenIndex;
      this.endTokenIndex = endTokenIndex;
      this.isFunctionScope = isFunctionScope;
    }
  };
  var StateSnapshot = class {
    constructor(potentialArrowAt, noAnonFunctionType, inDisallowConditionalTypesContext, tokensLength, scopesLength, pos, type, contextualKeyword, start, end, isType, scopeDepth, error) {
      ;
      this.potentialArrowAt = potentialArrowAt;
      this.noAnonFunctionType = noAnonFunctionType;
      this.inDisallowConditionalTypesContext = inDisallowConditionalTypesContext;
      this.tokensLength = tokensLength;
      this.scopesLength = scopesLength;
      this.pos = pos;
      this.type = type;
      this.contextualKeyword = contextualKeyword;
      this.start = start;
      this.end = end;
      this.isType = isType;
      this.scopeDepth = scopeDepth;
      this.error = error;
    }
  };
  var State = class _State {
    constructor() {
      _State.prototype.__init.call(this);
      _State.prototype.__init2.call(this);
      _State.prototype.__init3.call(this);
      _State.prototype.__init4.call(this);
      _State.prototype.__init5.call(this);
      _State.prototype.__init6.call(this);
      _State.prototype.__init7.call(this);
      _State.prototype.__init8.call(this);
      _State.prototype.__init9.call(this);
      _State.prototype.__init10.call(this);
      _State.prototype.__init11.call(this);
      _State.prototype.__init12.call(this);
      _State.prototype.__init13.call(this);
    }
    // Used to signify the start of a potential arrow function
    __init() {
      this.potentialArrowAt = -1;
    }
    // Used by Flow to handle an edge case involving function type parsing.
    __init2() {
      this.noAnonFunctionType = false;
    }
    // Used by TypeScript to handle ambiguities when parsing conditional types.
    __init3() {
      this.inDisallowConditionalTypesContext = false;
    }
    // Token store.
    __init4() {
      this.tokens = [];
    }
    // Array of all observed scopes, ordered by their ending position.
    __init5() {
      this.scopes = [];
    }
    // The current position of the tokenizer in the input.
    __init6() {
      this.pos = 0;
    }
    // Information about the current token.
    __init7() {
      this.type = TokenType3.eof;
    }
    __init8() {
      this.contextualKeyword = ContextualKeyword.NONE;
    }
    __init9() {
      this.start = 0;
    }
    __init10() {
      this.end = 0;
    }
    __init11() {
      this.isType = false;
    }
    __init12() {
      this.scopeDepth = 0;
    }
    /**
     * If the parser is in an error state, then the token is always tt.eof and all functions can
     * keep executing but should be written so they don't get into an infinite loop in this situation.
     *
     * This approach, combined with the ability to snapshot and restore state, allows us to implement
     * backtracking without exceptions and without needing to explicitly propagate error states
     * everywhere.
     */
    __init13() {
      this.error = null;
    }
    snapshot() {
      return new StateSnapshot(
        this.potentialArrowAt,
        this.noAnonFunctionType,
        this.inDisallowConditionalTypesContext,
        this.tokens.length,
        this.scopes.length,
        this.pos,
        this.type,
        this.contextualKeyword,
        this.start,
        this.end,
        this.isType,
        this.scopeDepth,
        this.error
      );
    }
    restoreFromSnapshot(snapshot) {
      this.potentialArrowAt = snapshot.potentialArrowAt;
      this.noAnonFunctionType = snapshot.noAnonFunctionType;
      this.inDisallowConditionalTypesContext = snapshot.inDisallowConditionalTypesContext;
      this.tokens.length = snapshot.tokensLength;
      this.scopes.length = snapshot.scopesLength;
      this.pos = snapshot.pos;
      this.type = snapshot.type;
      this.contextualKeyword = snapshot.contextualKeyword;
      this.start = snapshot.start;
      this.end = snapshot.end;
      this.isType = snapshot.isType;
      this.scopeDepth = snapshot.scopeDepth;
      this.error = snapshot.error;
    }
  };

  // node_modules/sucrase/dist/esm/parser/util/charcodes.js
  var charCodes;
  (function(charCodes2) {
    const backSpace = 8;
    charCodes2[charCodes2["backSpace"] = backSpace] = "backSpace";
    const lineFeed = 10;
    charCodes2[charCodes2["lineFeed"] = lineFeed] = "lineFeed";
    const tab = 9;
    charCodes2[charCodes2["tab"] = tab] = "tab";
    const carriageReturn = 13;
    charCodes2[charCodes2["carriageReturn"] = carriageReturn] = "carriageReturn";
    const shiftOut = 14;
    charCodes2[charCodes2["shiftOut"] = shiftOut] = "shiftOut";
    const space = 32;
    charCodes2[charCodes2["space"] = space] = "space";
    const exclamationMark = 33;
    charCodes2[charCodes2["exclamationMark"] = exclamationMark] = "exclamationMark";
    const quotationMark = 34;
    charCodes2[charCodes2["quotationMark"] = quotationMark] = "quotationMark";
    const numberSign = 35;
    charCodes2[charCodes2["numberSign"] = numberSign] = "numberSign";
    const dollarSign = 36;
    charCodes2[charCodes2["dollarSign"] = dollarSign] = "dollarSign";
    const percentSign = 37;
    charCodes2[charCodes2["percentSign"] = percentSign] = "percentSign";
    const ampersand = 38;
    charCodes2[charCodes2["ampersand"] = ampersand] = "ampersand";
    const apostrophe = 39;
    charCodes2[charCodes2["apostrophe"] = apostrophe] = "apostrophe";
    const leftParenthesis = 40;
    charCodes2[charCodes2["leftParenthesis"] = leftParenthesis] = "leftParenthesis";
    const rightParenthesis = 41;
    charCodes2[charCodes2["rightParenthesis"] = rightParenthesis] = "rightParenthesis";
    const asterisk = 42;
    charCodes2[charCodes2["asterisk"] = asterisk] = "asterisk";
    const plusSign = 43;
    charCodes2[charCodes2["plusSign"] = plusSign] = "plusSign";
    const comma2 = 44;
    charCodes2[charCodes2["comma"] = comma2] = "comma";
    const dash = 45;
    charCodes2[charCodes2["dash"] = dash] = "dash";
    const dot = 46;
    charCodes2[charCodes2["dot"] = dot] = "dot";
    const slash = 47;
    charCodes2[charCodes2["slash"] = slash] = "slash";
    const digit0 = 48;
    charCodes2[charCodes2["digit0"] = digit0] = "digit0";
    const digit1 = 49;
    charCodes2[charCodes2["digit1"] = digit1] = "digit1";
    const digit2 = 50;
    charCodes2[charCodes2["digit2"] = digit2] = "digit2";
    const digit3 = 51;
    charCodes2[charCodes2["digit3"] = digit3] = "digit3";
    const digit4 = 52;
    charCodes2[charCodes2["digit4"] = digit4] = "digit4";
    const digit5 = 53;
    charCodes2[charCodes2["digit5"] = digit5] = "digit5";
    const digit6 = 54;
    charCodes2[charCodes2["digit6"] = digit6] = "digit6";
    const digit7 = 55;
    charCodes2[charCodes2["digit7"] = digit7] = "digit7";
    const digit8 = 56;
    charCodes2[charCodes2["digit8"] = digit8] = "digit8";
    const digit9 = 57;
    charCodes2[charCodes2["digit9"] = digit9] = "digit9";
    const colon = 58;
    charCodes2[charCodes2["colon"] = colon] = "colon";
    const semicolon3 = 59;
    charCodes2[charCodes2["semicolon"] = semicolon3] = "semicolon";
    const lessThan = 60;
    charCodes2[charCodes2["lessThan"] = lessThan] = "lessThan";
    const equalsTo = 61;
    charCodes2[charCodes2["equalsTo"] = equalsTo] = "equalsTo";
    const greaterThan = 62;
    charCodes2[charCodes2["greaterThan"] = greaterThan] = "greaterThan";
    const questionMark = 63;
    charCodes2[charCodes2["questionMark"] = questionMark] = "questionMark";
    const atSign = 64;
    charCodes2[charCodes2["atSign"] = atSign] = "atSign";
    const uppercaseA = 65;
    charCodes2[charCodes2["uppercaseA"] = uppercaseA] = "uppercaseA";
    const uppercaseB = 66;
    charCodes2[charCodes2["uppercaseB"] = uppercaseB] = "uppercaseB";
    const uppercaseC = 67;
    charCodes2[charCodes2["uppercaseC"] = uppercaseC] = "uppercaseC";
    const uppercaseD = 68;
    charCodes2[charCodes2["uppercaseD"] = uppercaseD] = "uppercaseD";
    const uppercaseE = 69;
    charCodes2[charCodes2["uppercaseE"] = uppercaseE] = "uppercaseE";
    const uppercaseF = 70;
    charCodes2[charCodes2["uppercaseF"] = uppercaseF] = "uppercaseF";
    const uppercaseG = 71;
    charCodes2[charCodes2["uppercaseG"] = uppercaseG] = "uppercaseG";
    const uppercaseH = 72;
    charCodes2[charCodes2["uppercaseH"] = uppercaseH] = "uppercaseH";
    const uppercaseI = 73;
    charCodes2[charCodes2["uppercaseI"] = uppercaseI] = "uppercaseI";
    const uppercaseJ = 74;
    charCodes2[charCodes2["uppercaseJ"] = uppercaseJ] = "uppercaseJ";
    const uppercaseK = 75;
    charCodes2[charCodes2["uppercaseK"] = uppercaseK] = "uppercaseK";
    const uppercaseL = 76;
    charCodes2[charCodes2["uppercaseL"] = uppercaseL] = "uppercaseL";
    const uppercaseM = 77;
    charCodes2[charCodes2["uppercaseM"] = uppercaseM] = "uppercaseM";
    const uppercaseN = 78;
    charCodes2[charCodes2["uppercaseN"] = uppercaseN] = "uppercaseN";
    const uppercaseO = 79;
    charCodes2[charCodes2["uppercaseO"] = uppercaseO] = "uppercaseO";
    const uppercaseP = 80;
    charCodes2[charCodes2["uppercaseP"] = uppercaseP] = "uppercaseP";
    const uppercaseQ = 81;
    charCodes2[charCodes2["uppercaseQ"] = uppercaseQ] = "uppercaseQ";
    const uppercaseR = 82;
    charCodes2[charCodes2["uppercaseR"] = uppercaseR] = "uppercaseR";
    const uppercaseS = 83;
    charCodes2[charCodes2["uppercaseS"] = uppercaseS] = "uppercaseS";
    const uppercaseT = 84;
    charCodes2[charCodes2["uppercaseT"] = uppercaseT] = "uppercaseT";
    const uppercaseU = 85;
    charCodes2[charCodes2["uppercaseU"] = uppercaseU] = "uppercaseU";
    const uppercaseV = 86;
    charCodes2[charCodes2["uppercaseV"] = uppercaseV] = "uppercaseV";
    const uppercaseW = 87;
    charCodes2[charCodes2["uppercaseW"] = uppercaseW] = "uppercaseW";
    const uppercaseX = 88;
    charCodes2[charCodes2["uppercaseX"] = uppercaseX] = "uppercaseX";
    const uppercaseY = 89;
    charCodes2[charCodes2["uppercaseY"] = uppercaseY] = "uppercaseY";
    const uppercaseZ = 90;
    charCodes2[charCodes2["uppercaseZ"] = uppercaseZ] = "uppercaseZ";
    const leftSquareBracket = 91;
    charCodes2[charCodes2["leftSquareBracket"] = leftSquareBracket] = "leftSquareBracket";
    const backslash = 92;
    charCodes2[charCodes2["backslash"] = backslash] = "backslash";
    const rightSquareBracket = 93;
    charCodes2[charCodes2["rightSquareBracket"] = rightSquareBracket] = "rightSquareBracket";
    const caret = 94;
    charCodes2[charCodes2["caret"] = caret] = "caret";
    const underscore = 95;
    charCodes2[charCodes2["underscore"] = underscore] = "underscore";
    const graveAccent = 96;
    charCodes2[charCodes2["graveAccent"] = graveAccent] = "graveAccent";
    const lowercaseA = 97;
    charCodes2[charCodes2["lowercaseA"] = lowercaseA] = "lowercaseA";
    const lowercaseB = 98;
    charCodes2[charCodes2["lowercaseB"] = lowercaseB] = "lowercaseB";
    const lowercaseC = 99;
    charCodes2[charCodes2["lowercaseC"] = lowercaseC] = "lowercaseC";
    const lowercaseD = 100;
    charCodes2[charCodes2["lowercaseD"] = lowercaseD] = "lowercaseD";
    const lowercaseE = 101;
    charCodes2[charCodes2["lowercaseE"] = lowercaseE] = "lowercaseE";
    const lowercaseF = 102;
    charCodes2[charCodes2["lowercaseF"] = lowercaseF] = "lowercaseF";
    const lowercaseG = 103;
    charCodes2[charCodes2["lowercaseG"] = lowercaseG] = "lowercaseG";
    const lowercaseH = 104;
    charCodes2[charCodes2["lowercaseH"] = lowercaseH] = "lowercaseH";
    const lowercaseI = 105;
    charCodes2[charCodes2["lowercaseI"] = lowercaseI] = "lowercaseI";
    const lowercaseJ = 106;
    charCodes2[charCodes2["lowercaseJ"] = lowercaseJ] = "lowercaseJ";
    const lowercaseK = 107;
    charCodes2[charCodes2["lowercaseK"] = lowercaseK] = "lowercaseK";
    const lowercaseL = 108;
    charCodes2[charCodes2["lowercaseL"] = lowercaseL] = "lowercaseL";
    const lowercaseM = 109;
    charCodes2[charCodes2["lowercaseM"] = lowercaseM] = "lowercaseM";
    const lowercaseN = 110;
    charCodes2[charCodes2["lowercaseN"] = lowercaseN] = "lowercaseN";
    const lowercaseO = 111;
    charCodes2[charCodes2["lowercaseO"] = lowercaseO] = "lowercaseO";
    const lowercaseP = 112;
    charCodes2[charCodes2["lowercaseP"] = lowercaseP] = "lowercaseP";
    const lowercaseQ = 113;
    charCodes2[charCodes2["lowercaseQ"] = lowercaseQ] = "lowercaseQ";
    const lowercaseR = 114;
    charCodes2[charCodes2["lowercaseR"] = lowercaseR] = "lowercaseR";
    const lowercaseS = 115;
    charCodes2[charCodes2["lowercaseS"] = lowercaseS] = "lowercaseS";
    const lowercaseT = 116;
    charCodes2[charCodes2["lowercaseT"] = lowercaseT] = "lowercaseT";
    const lowercaseU = 117;
    charCodes2[charCodes2["lowercaseU"] = lowercaseU] = "lowercaseU";
    const lowercaseV = 118;
    charCodes2[charCodes2["lowercaseV"] = lowercaseV] = "lowercaseV";
    const lowercaseW = 119;
    charCodes2[charCodes2["lowercaseW"] = lowercaseW] = "lowercaseW";
    const lowercaseX = 120;
    charCodes2[charCodes2["lowercaseX"] = lowercaseX] = "lowercaseX";
    const lowercaseY = 121;
    charCodes2[charCodes2["lowercaseY"] = lowercaseY] = "lowercaseY";
    const lowercaseZ = 122;
    charCodes2[charCodes2["lowercaseZ"] = lowercaseZ] = "lowercaseZ";
    const leftCurlyBrace = 123;
    charCodes2[charCodes2["leftCurlyBrace"] = leftCurlyBrace] = "leftCurlyBrace";
    const verticalBar = 124;
    charCodes2[charCodes2["verticalBar"] = verticalBar] = "verticalBar";
    const rightCurlyBrace = 125;
    charCodes2[charCodes2["rightCurlyBrace"] = rightCurlyBrace] = "rightCurlyBrace";
    const tilde = 126;
    charCodes2[charCodes2["tilde"] = tilde] = "tilde";
    const nonBreakingSpace = 160;
    charCodes2[charCodes2["nonBreakingSpace"] = nonBreakingSpace] = "nonBreakingSpace";
    const oghamSpaceMark = 5760;
    charCodes2[charCodes2["oghamSpaceMark"] = oghamSpaceMark] = "oghamSpaceMark";
    const lineSeparator = 8232;
    charCodes2[charCodes2["lineSeparator"] = lineSeparator] = "lineSeparator";
    const paragraphSeparator = 8233;
    charCodes2[charCodes2["paragraphSeparator"] = paragraphSeparator] = "paragraphSeparator";
  })(charCodes || (charCodes = {}));

  // node_modules/sucrase/dist/esm/parser/traverser/base.js
  var isJSXEnabled;
  var isTypeScriptEnabled;
  var isFlowEnabled;
  var state;
  var input;
  var nextContextId;
  function getNextContextId() {
    return nextContextId++;
  }
  function augmentError(error) {
    if ("pos" in error) {
      const loc = locationForIndex(error.pos);
      error.message += ` (${loc.line}:${loc.column})`;
      error.loc = loc;
    }
    return error;
  }
  var Loc = class {
    constructor(line, column) {
      this.line = line;
      this.column = column;
    }
  };
  function locationForIndex(pos) {
    let line = 1;
    let column = 1;
    for (let i = 0; i < pos; i++) {
      if (input.charCodeAt(i) === charCodes.lineFeed) {
        line++;
        column = 1;
      } else {
        column++;
      }
    }
    return new Loc(line, column);
  }
  function initParser(inputCode, isJSXEnabledArg, isTypeScriptEnabledArg, isFlowEnabledArg) {
    input = inputCode;
    state = new State();
    nextContextId = 1;
    isJSXEnabled = isJSXEnabledArg;
    isTypeScriptEnabled = isTypeScriptEnabledArg;
    isFlowEnabled = isFlowEnabledArg;
  }

  // node_modules/sucrase/dist/esm/parser/traverser/util.js
  function isContextual(contextualKeyword) {
    return state.contextualKeyword === contextualKeyword;
  }
  function isLookaheadContextual(contextualKeyword) {
    const l = lookaheadTypeAndKeyword();
    return l.type === TokenType3.name && l.contextualKeyword === contextualKeyword;
  }
  function eatContextual(contextualKeyword) {
    return state.contextualKeyword === contextualKeyword && eat2(TokenType3.name);
  }
  function expectContextual(contextualKeyword) {
    if (!eatContextual(contextualKeyword)) {
      unexpected();
    }
  }
  function canInsertSemicolon() {
    return match(TokenType3.eof) || match(TokenType3.braceR) || hasPrecedingLineBreak();
  }
  function hasPrecedingLineBreak() {
    const prevToken = state.tokens[state.tokens.length - 1];
    const lastTokEnd = prevToken ? prevToken.end : 0;
    for (let i = lastTokEnd; i < state.start; i++) {
      const code = input.charCodeAt(i);
      if (code === charCodes.lineFeed || code === charCodes.carriageReturn || code === 8232 || code === 8233) {
        return true;
      }
    }
    return false;
  }
  function hasFollowingLineBreak() {
    const nextStart = nextTokenStart();
    for (let i = state.end; i < nextStart; i++) {
      const code = input.charCodeAt(i);
      if (code === charCodes.lineFeed || code === charCodes.carriageReturn || code === 8232 || code === 8233) {
        return true;
      }
    }
    return false;
  }
  function isLineTerminator() {
    return eat2(TokenType3.semi) || canInsertSemicolon();
  }
  function semicolon() {
    if (!isLineTerminator()) {
      unexpected('Unexpected token, expected ";"');
    }
  }
  function expect(type) {
    const matched = eat2(type);
    if (!matched) {
      unexpected(`Unexpected token, expected "${formatTokenType(type)}"`);
    }
  }
  function unexpected(message = "Unexpected token", pos = state.start) {
    if (state.error) {
      return;
    }
    const err = new SyntaxError(message);
    err.pos = pos;
    state.error = err;
    state.pos = input.length;
    finishToken(TokenType3.eof);
  }

  // node_modules/sucrase/dist/esm/parser/util/whitespace.js
  var WHITESPACE_CHARS = [
    9,
    11,
    12,
    charCodes.space,
    charCodes.nonBreakingSpace,
    charCodes.oghamSpaceMark,
    8192,
    // EN QUAD
    8193,
    // EM QUAD
    8194,
    // EN SPACE
    8195,
    // EM SPACE
    8196,
    // THREE-PER-EM SPACE
    8197,
    // FOUR-PER-EM SPACE
    8198,
    // SIX-PER-EM SPACE
    8199,
    // FIGURE SPACE
    8200,
    // PUNCTUATION SPACE
    8201,
    // THIN SPACE
    8202,
    // HAIR SPACE
    8239,
    // NARROW NO-BREAK SPACE
    8287,
    // MEDIUM MATHEMATICAL SPACE
    12288,
    // IDEOGRAPHIC SPACE
    65279
    // ZERO WIDTH NO-BREAK SPACE
  ];
  var skipWhiteSpace2 = /(?:\s|\/\/.*|\/\*[^]*?\*\/)*/g;
  var IS_WHITESPACE = new Uint8Array(65536);
  for (const char of WHITESPACE_CHARS) {
    IS_WHITESPACE[char] = 1;
  }

  // node_modules/sucrase/dist/esm/parser/util/identifier.js
  function computeIsIdentifierChar(code) {
    if (code < 48) return code === 36;
    if (code < 58) return true;
    if (code < 65) return false;
    if (code < 91) return true;
    if (code < 97) return code === 95;
    if (code < 123) return true;
    if (code < 128) return false;
    throw new Error("Should not be called with non-ASCII char code.");
  }
  var IS_IDENTIFIER_CHAR = new Uint8Array(65536);
  for (let i = 0; i < 128; i++) {
    IS_IDENTIFIER_CHAR[i] = computeIsIdentifierChar(i) ? 1 : 0;
  }
  for (let i = 128; i < 65536; i++) {
    IS_IDENTIFIER_CHAR[i] = 1;
  }
  for (const whitespaceChar of WHITESPACE_CHARS) {
    IS_IDENTIFIER_CHAR[whitespaceChar] = 0;
  }
  IS_IDENTIFIER_CHAR[8232] = 0;
  IS_IDENTIFIER_CHAR[8233] = 0;
  var IS_IDENTIFIER_START = IS_IDENTIFIER_CHAR.slice();
  for (let numChar = charCodes.digit0; numChar <= charCodes.digit9; numChar++) {
    IS_IDENTIFIER_START[numChar] = 0;
  }

  // node_modules/sucrase/dist/esm/parser/tokenizer/readWordTree.js
  var READ_WORD_TREE = new Int32Array([
    // ""
    -1,
    27,
    783,
    918,
    1755,
    2376,
    2862,
    3483,
    -1,
    3699,
    -1,
    4617,
    4752,
    4833,
    5130,
    5508,
    5940,
    -1,
    6480,
    6939,
    7749,
    8181,
    8451,
    8613,
    -1,
    8829,
    -1,
    // "a"
    -1,
    -1,
    54,
    243,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    432,
    -1,
    -1,
    -1,
    675,
    -1,
    -1,
    -1,
    // "ab"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    81,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "abs"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    108,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "abst"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    135,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "abstr"
    -1,
    162,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "abstra"
    -1,
    -1,
    -1,
    189,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "abstrac"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    216,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "abstract"
    ContextualKeyword._abstract << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ac"
    -1,
    -1,
    -1,
    270,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "acc"
    -1,
    -1,
    -1,
    -1,
    -1,
    297,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "acce"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    324,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "acces"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    351,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "access"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    378,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "accesso"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    405,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "accessor"
    ContextualKeyword._accessor << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "as"
    ContextualKeyword._as << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    459,
    -1,
    -1,
    -1,
    -1,
    -1,
    594,
    -1,
    // "ass"
    -1,
    -1,
    -1,
    -1,
    -1,
    486,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "asse"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    513,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "asser"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    540,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "assert"
    ContextualKeyword._assert << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    567,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "asserts"
    ContextualKeyword._asserts << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "asy"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    621,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "asyn"
    -1,
    -1,
    -1,
    648,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "async"
    ContextualKeyword._async << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "aw"
    -1,
    702,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "awa"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    729,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "awai"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    756,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "await"
    ContextualKeyword._await << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "b"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    810,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "br"
    -1,
    -1,
    -1,
    -1,
    -1,
    837,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "bre"
    -1,
    864,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "brea"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    891,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "break"
    (TokenType3._break << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "c"
    -1,
    945,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1107,
    -1,
    -1,
    -1,
    1242,
    -1,
    -1,
    1350,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ca"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    972,
    1026,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "cas"
    -1,
    -1,
    -1,
    -1,
    -1,
    999,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "case"
    (TokenType3._case << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "cat"
    -1,
    -1,
    -1,
    1053,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "catc"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1080,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "catch"
    (TokenType3._catch << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ch"
    -1,
    -1,
    -1,
    -1,
    -1,
    1134,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "che"
    -1,
    -1,
    -1,
    1161,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "chec"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1188,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "check"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1215,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "checks"
    ContextualKeyword._checks << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "cl"
    -1,
    1269,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "cla"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1296,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "clas"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1323,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "class"
    (TokenType3._class << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "co"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1377,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "con"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1404,
    1620,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "cons"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1431,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "const"
    (TokenType3._const << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1458,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "constr"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1485,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "constru"
    -1,
    -1,
    -1,
    1512,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "construc"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1539,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "construct"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1566,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "constructo"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1593,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "constructor"
    ContextualKeyword._constructor << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "cont"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1647,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "conti"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1674,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "contin"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1701,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "continu"
    -1,
    -1,
    -1,
    -1,
    -1,
    1728,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "continue"
    (TokenType3._continue << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "d"
    -1,
    -1,
    -1,
    -1,
    -1,
    1782,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2349,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "de"
    -1,
    -1,
    1809,
    1971,
    -1,
    -1,
    2106,
    -1,
    -1,
    -1,
    -1,
    -1,
    2241,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "deb"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1836,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "debu"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1863,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "debug"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1890,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "debugg"
    -1,
    -1,
    -1,
    -1,
    -1,
    1917,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "debugge"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1944,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "debugger"
    (TokenType3._debugger << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "dec"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    1998,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "decl"
    -1,
    2025,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "decla"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2052,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "declar"
    -1,
    -1,
    -1,
    -1,
    -1,
    2079,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "declare"
    ContextualKeyword._declare << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "def"
    -1,
    2133,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "defa"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2160,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "defau"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2187,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "defaul"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2214,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "default"
    (TokenType3._default << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "del"
    -1,
    -1,
    -1,
    -1,
    -1,
    2268,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "dele"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2295,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "delet"
    -1,
    -1,
    -1,
    -1,
    -1,
    2322,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "delete"
    (TokenType3._delete << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "do"
    (TokenType3._do << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "e"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2403,
    -1,
    2484,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2565,
    -1,
    -1,
    // "el"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2430,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "els"
    -1,
    -1,
    -1,
    -1,
    -1,
    2457,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "else"
    (TokenType3._else << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "en"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2511,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "enu"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2538,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "enum"
    ContextualKeyword._enum << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ex"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2592,
    -1,
    -1,
    -1,
    2727,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "exp"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2619,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "expo"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2646,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "expor"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2673,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "export"
    (TokenType3._export << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2700,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "exports"
    ContextualKeyword._exports << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ext"
    -1,
    -1,
    -1,
    -1,
    -1,
    2754,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "exte"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2781,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "exten"
    -1,
    -1,
    -1,
    -1,
    2808,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "extend"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2835,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "extends"
    (TokenType3._extends << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "f"
    -1,
    2889,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2997,
    -1,
    -1,
    -1,
    -1,
    -1,
    3159,
    -1,
    -1,
    3213,
    -1,
    -1,
    3294,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "fa"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2916,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "fal"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    2943,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "fals"
    -1,
    -1,
    -1,
    -1,
    -1,
    2970,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "false"
    (TokenType3._false << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "fi"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3024,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "fin"
    -1,
    3051,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "fina"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3078,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "final"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3105,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "finall"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3132,
    -1,
    // "finally"
    (TokenType3._finally << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "fo"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3186,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "for"
    (TokenType3._for << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "fr"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3240,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "fro"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3267,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "from"
    ContextualKeyword._from << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "fu"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3321,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "fun"
    -1,
    -1,
    -1,
    3348,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "func"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3375,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "funct"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3402,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "functi"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3429,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "functio"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3456,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "function"
    (TokenType3._function << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "g"
    -1,
    -1,
    -1,
    -1,
    -1,
    3510,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3564,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ge"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3537,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "get"
    ContextualKeyword._get << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "gl"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3591,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "glo"
    -1,
    -1,
    3618,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "glob"
    -1,
    3645,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "globa"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3672,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "global"
    ContextualKeyword._global << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "i"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3726,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3753,
    4077,
    -1,
    -1,
    -1,
    -1,
    4590,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "if"
    (TokenType3._if << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "im"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3780,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "imp"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3807,
    -1,
    -1,
    3996,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "impl"
    -1,
    -1,
    -1,
    -1,
    -1,
    3834,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "imple"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3861,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "implem"
    -1,
    -1,
    -1,
    -1,
    -1,
    3888,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "impleme"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3915,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "implemen"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3942,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "implement"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    3969,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "implements"
    ContextualKeyword._implements << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "impo"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4023,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "impor"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4050,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "import"
    (TokenType3._import << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "in"
    (TokenType3._in << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4104,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4185,
    4401,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "inf"
    -1,
    -1,
    -1,
    -1,
    -1,
    4131,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "infe"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4158,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "infer"
    ContextualKeyword._infer << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ins"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4212,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "inst"
    -1,
    4239,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "insta"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4266,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "instan"
    -1,
    -1,
    -1,
    4293,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "instanc"
    -1,
    -1,
    -1,
    -1,
    -1,
    4320,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "instance"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4347,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "instanceo"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4374,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "instanceof"
    (TokenType3._instanceof << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "int"
    -1,
    -1,
    -1,
    -1,
    -1,
    4428,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "inte"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4455,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "inter"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4482,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "interf"
    -1,
    4509,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "interfa"
    -1,
    -1,
    -1,
    4536,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "interfac"
    -1,
    -1,
    -1,
    -1,
    -1,
    4563,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "interface"
    ContextualKeyword._interface << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "is"
    ContextualKeyword._is << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "k"
    -1,
    -1,
    -1,
    -1,
    -1,
    4644,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ke"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4671,
    -1,
    // "key"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4698,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "keyo"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4725,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "keyof"
    ContextualKeyword._keyof << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "l"
    -1,
    -1,
    -1,
    -1,
    -1,
    4779,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "le"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4806,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "let"
    (TokenType3._let << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "m"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4860,
    -1,
    -1,
    -1,
    -1,
    -1,
    4995,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "mi"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4887,
    -1,
    -1,
    // "mix"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4914,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "mixi"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4941,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "mixin"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    4968,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "mixins"
    ContextualKeyword._mixins << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "mo"
    -1,
    -1,
    -1,
    -1,
    5022,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "mod"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5049,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "modu"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5076,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "modul"
    -1,
    -1,
    -1,
    -1,
    -1,
    5103,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "module"
    ContextualKeyword._module << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "n"
    -1,
    5157,
    -1,
    -1,
    -1,
    5373,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5427,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "na"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5184,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "nam"
    -1,
    -1,
    -1,
    -1,
    -1,
    5211,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "name"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5238,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "names"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5265,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "namesp"
    -1,
    5292,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "namespa"
    -1,
    -1,
    -1,
    5319,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "namespac"
    -1,
    -1,
    -1,
    -1,
    -1,
    5346,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "namespace"
    ContextualKeyword._namespace << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ne"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5400,
    -1,
    -1,
    -1,
    // "new"
    (TokenType3._new << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "nu"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5454,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "nul"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5481,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "null"
    (TokenType3._null << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "o"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5535,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5562,
    -1,
    -1,
    -1,
    -1,
    5697,
    5751,
    -1,
    -1,
    -1,
    -1,
    // "of"
    ContextualKeyword._of << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "op"
    -1,
    5589,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "opa"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5616,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "opaq"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5643,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "opaqu"
    -1,
    -1,
    -1,
    -1,
    -1,
    5670,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "opaque"
    ContextualKeyword._opaque << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ou"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5724,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "out"
    ContextualKeyword._out << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ov"
    -1,
    -1,
    -1,
    -1,
    -1,
    5778,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ove"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5805,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "over"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5832,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "overr"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5859,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "overri"
    -1,
    -1,
    -1,
    -1,
    5886,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "overrid"
    -1,
    -1,
    -1,
    -1,
    -1,
    5913,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "override"
    ContextualKeyword._override << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "p"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5967,
    -1,
    -1,
    6345,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "pr"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    5994,
    -1,
    -1,
    -1,
    -1,
    -1,
    6129,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "pri"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6021,
    -1,
    -1,
    -1,
    -1,
    // "priv"
    -1,
    6048,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "priva"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6075,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "privat"
    -1,
    -1,
    -1,
    -1,
    -1,
    6102,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "private"
    ContextualKeyword._private << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "pro"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6156,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "prot"
    -1,
    -1,
    -1,
    -1,
    -1,
    6183,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6318,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "prote"
    -1,
    -1,
    -1,
    6210,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "protec"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6237,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "protect"
    -1,
    -1,
    -1,
    -1,
    -1,
    6264,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "protecte"
    -1,
    -1,
    -1,
    -1,
    6291,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "protected"
    ContextualKeyword._protected << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "proto"
    ContextualKeyword._proto << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "pu"
    -1,
    -1,
    6372,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "pub"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6399,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "publ"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6426,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "publi"
    -1,
    -1,
    -1,
    6453,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "public"
    ContextualKeyword._public << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "r"
    -1,
    -1,
    -1,
    -1,
    -1,
    6507,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "re"
    -1,
    6534,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6696,
    -1,
    -1,
    6831,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "rea"
    -1,
    -1,
    -1,
    -1,
    6561,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "read"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6588,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "reado"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6615,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "readon"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6642,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "readonl"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6669,
    -1,
    // "readonly"
    ContextualKeyword._readonly << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "req"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6723,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "requ"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6750,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "requi"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6777,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "requir"
    -1,
    -1,
    -1,
    -1,
    -1,
    6804,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "require"
    ContextualKeyword._require << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ret"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6858,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "retu"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6885,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "retur"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6912,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "return"
    (TokenType3._return << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "s"
    -1,
    6966,
    -1,
    -1,
    -1,
    7182,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7236,
    7371,
    -1,
    7479,
    -1,
    7614,
    -1,
    // "sa"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    6993,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "sat"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7020,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "sati"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7047,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "satis"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7074,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "satisf"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7101,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "satisfi"
    -1,
    -1,
    -1,
    -1,
    -1,
    7128,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "satisfie"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7155,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "satisfies"
    ContextualKeyword._satisfies << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "se"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7209,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "set"
    ContextualKeyword._set << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "st"
    -1,
    7263,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "sta"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7290,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "stat"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7317,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "stati"
    -1,
    -1,
    -1,
    7344,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "static"
    ContextualKeyword._static << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "su"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7398,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "sup"
    -1,
    -1,
    -1,
    -1,
    -1,
    7425,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "supe"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7452,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "super"
    (TokenType3._super << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "sw"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7506,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "swi"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7533,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "swit"
    -1,
    -1,
    -1,
    7560,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "switc"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7587,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "switch"
    (TokenType3._switch << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "sy"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7641,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "sym"
    -1,
    -1,
    7668,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "symb"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7695,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "symbo"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7722,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "symbol"
    ContextualKeyword._symbol << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "t"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7776,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7938,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8046,
    -1,
    // "th"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7803,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7857,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "thi"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7830,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "this"
    (TokenType3._this << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "thr"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7884,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "thro"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7911,
    -1,
    -1,
    -1,
    // "throw"
    (TokenType3._throw << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "tr"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    7965,
    -1,
    -1,
    -1,
    8019,
    -1,
    // "tru"
    -1,
    -1,
    -1,
    -1,
    -1,
    7992,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "true"
    (TokenType3._true << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "try"
    (TokenType3._try << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "ty"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8073,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "typ"
    -1,
    -1,
    -1,
    -1,
    -1,
    8100,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "type"
    ContextualKeyword._type << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8127,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "typeo"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8154,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "typeof"
    (TokenType3._typeof << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "u"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8208,
    -1,
    -1,
    -1,
    -1,
    8343,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "un"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8235,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "uni"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8262,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "uniq"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8289,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "uniqu"
    -1,
    -1,
    -1,
    -1,
    -1,
    8316,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "unique"
    ContextualKeyword._unique << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "us"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8370,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "usi"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8397,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "usin"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8424,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "using"
    ContextualKeyword._using << 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "v"
    -1,
    8478,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8532,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "va"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8505,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "var"
    (TokenType3._var << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "vo"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8559,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "voi"
    -1,
    -1,
    -1,
    -1,
    8586,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "void"
    (TokenType3._void << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "w"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8640,
    8748,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "wh"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8667,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "whi"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8694,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "whil"
    -1,
    -1,
    -1,
    -1,
    -1,
    8721,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "while"
    (TokenType3._while << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "wi"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8775,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "wit"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8802,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "with"
    (TokenType3._with << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "y"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8856,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "yi"
    -1,
    -1,
    -1,
    -1,
    -1,
    8883,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "yie"
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    8910,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "yiel"
    -1,
    -1,
    -1,
    -1,
    8937,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    // "yield"
    (TokenType3._yield << 1) + 1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1,
    -1
  ]);

  // node_modules/sucrase/dist/esm/parser/tokenizer/readWord.js
  function readWord() {
    let treePos = 0;
    let code = 0;
    let pos = state.pos;
    while (pos < input.length) {
      code = input.charCodeAt(pos);
      if (code < charCodes.lowercaseA || code > charCodes.lowercaseZ) {
        break;
      }
      const next2 = READ_WORD_TREE[treePos + (code - charCodes.lowercaseA) + 1];
      if (next2 === -1) {
        break;
      } else {
        treePos = next2;
        pos++;
      }
    }
    const keywordValue = READ_WORD_TREE[treePos];
    if (keywordValue > -1 && !IS_IDENTIFIER_CHAR[code]) {
      state.pos = pos;
      if (keywordValue & 1) {
        finishToken(keywordValue >>> 1);
      } else {
        finishToken(TokenType3.name, keywordValue >>> 1);
      }
      return;
    }
    while (pos < input.length) {
      const ch = input.charCodeAt(pos);
      if (IS_IDENTIFIER_CHAR[ch]) {
        pos++;
      } else if (ch === charCodes.backslash) {
        pos += 2;
        if (input.charCodeAt(pos) === charCodes.leftCurlyBrace) {
          while (pos < input.length && input.charCodeAt(pos) !== charCodes.rightCurlyBrace) {
            pos++;
          }
          pos++;
        }
      } else if (ch === charCodes.atSign && input.charCodeAt(pos + 1) === charCodes.atSign) {
        pos += 2;
      } else {
        break;
      }
    }
    state.pos = pos;
    finishToken(TokenType3.name);
  }

  // node_modules/sucrase/dist/esm/parser/tokenizer/index.js
  var IdentifierRole;
  (function(IdentifierRole2) {
    const Access = 0;
    IdentifierRole2[IdentifierRole2["Access"] = Access] = "Access";
    const ExportAccess = Access + 1;
    IdentifierRole2[IdentifierRole2["ExportAccess"] = ExportAccess] = "ExportAccess";
    const TopLevelDeclaration = ExportAccess + 1;
    IdentifierRole2[IdentifierRole2["TopLevelDeclaration"] = TopLevelDeclaration] = "TopLevelDeclaration";
    const FunctionScopedDeclaration = TopLevelDeclaration + 1;
    IdentifierRole2[IdentifierRole2["FunctionScopedDeclaration"] = FunctionScopedDeclaration] = "FunctionScopedDeclaration";
    const BlockScopedDeclaration = FunctionScopedDeclaration + 1;
    IdentifierRole2[IdentifierRole2["BlockScopedDeclaration"] = BlockScopedDeclaration] = "BlockScopedDeclaration";
    const ObjectShorthandTopLevelDeclaration = BlockScopedDeclaration + 1;
    IdentifierRole2[IdentifierRole2["ObjectShorthandTopLevelDeclaration"] = ObjectShorthandTopLevelDeclaration] = "ObjectShorthandTopLevelDeclaration";
    const ObjectShorthandFunctionScopedDeclaration = ObjectShorthandTopLevelDeclaration + 1;
    IdentifierRole2[IdentifierRole2["ObjectShorthandFunctionScopedDeclaration"] = ObjectShorthandFunctionScopedDeclaration] = "ObjectShorthandFunctionScopedDeclaration";
    const ObjectShorthandBlockScopedDeclaration = ObjectShorthandFunctionScopedDeclaration + 1;
    IdentifierRole2[IdentifierRole2["ObjectShorthandBlockScopedDeclaration"] = ObjectShorthandBlockScopedDeclaration] = "ObjectShorthandBlockScopedDeclaration";
    const ObjectShorthand = ObjectShorthandBlockScopedDeclaration + 1;
    IdentifierRole2[IdentifierRole2["ObjectShorthand"] = ObjectShorthand] = "ObjectShorthand";
    const ImportDeclaration = ObjectShorthand + 1;
    IdentifierRole2[IdentifierRole2["ImportDeclaration"] = ImportDeclaration] = "ImportDeclaration";
    const ObjectKey = ImportDeclaration + 1;
    IdentifierRole2[IdentifierRole2["ObjectKey"] = ObjectKey] = "ObjectKey";
    const ImportAccess = ObjectKey + 1;
    IdentifierRole2[IdentifierRole2["ImportAccess"] = ImportAccess] = "ImportAccess";
  })(IdentifierRole || (IdentifierRole = {}));
  var JSXRole;
  (function(JSXRole2) {
    const NoChildren = 0;
    JSXRole2[JSXRole2["NoChildren"] = NoChildren] = "NoChildren";
    const OneChild = NoChildren + 1;
    JSXRole2[JSXRole2["OneChild"] = OneChild] = "OneChild";
    const StaticChildren = OneChild + 1;
    JSXRole2[JSXRole2["StaticChildren"] = StaticChildren] = "StaticChildren";
    const KeyAfterPropSpread = StaticChildren + 1;
    JSXRole2[JSXRole2["KeyAfterPropSpread"] = KeyAfterPropSpread] = "KeyAfterPropSpread";
  })(JSXRole || (JSXRole = {}));
  function isDeclaration(token) {
    const role = token.identifierRole;
    return role === IdentifierRole.TopLevelDeclaration || role === IdentifierRole.FunctionScopedDeclaration || role === IdentifierRole.BlockScopedDeclaration || role === IdentifierRole.ObjectShorthandTopLevelDeclaration || role === IdentifierRole.ObjectShorthandFunctionScopedDeclaration || role === IdentifierRole.ObjectShorthandBlockScopedDeclaration;
  }
  function isNonTopLevelDeclaration(token) {
    const role = token.identifierRole;
    return role === IdentifierRole.FunctionScopedDeclaration || role === IdentifierRole.BlockScopedDeclaration || role === IdentifierRole.ObjectShorthandFunctionScopedDeclaration || role === IdentifierRole.ObjectShorthandBlockScopedDeclaration;
  }
  function isTopLevelDeclaration(token) {
    const role = token.identifierRole;
    return role === IdentifierRole.TopLevelDeclaration || role === IdentifierRole.ObjectShorthandTopLevelDeclaration || role === IdentifierRole.ImportDeclaration;
  }
  function isBlockScopedDeclaration(token) {
    const role = token.identifierRole;
    return role === IdentifierRole.TopLevelDeclaration || role === IdentifierRole.BlockScopedDeclaration || role === IdentifierRole.ObjectShorthandTopLevelDeclaration || role === IdentifierRole.ObjectShorthandBlockScopedDeclaration;
  }
  function isFunctionScopedDeclaration(token) {
    const role = token.identifierRole;
    return role === IdentifierRole.FunctionScopedDeclaration || role === IdentifierRole.ObjectShorthandFunctionScopedDeclaration;
  }
  function isObjectShorthandDeclaration(token) {
    return token.identifierRole === IdentifierRole.ObjectShorthandTopLevelDeclaration || token.identifierRole === IdentifierRole.ObjectShorthandBlockScopedDeclaration || token.identifierRole === IdentifierRole.ObjectShorthandFunctionScopedDeclaration;
  }
  var Token3 = class {
    constructor() {
      this.type = state.type;
      this.contextualKeyword = state.contextualKeyword;
      this.start = state.start;
      this.end = state.end;
      this.scopeDepth = state.scopeDepth;
      this.isType = state.isType;
      this.identifierRole = null;
      this.jsxRole = null;
      this.shadowsGlobal = false;
      this.isAsyncOperation = false;
      this.contextId = null;
      this.rhsEndIndex = null;
      this.isExpression = false;
      this.numNullishCoalesceStarts = 0;
      this.numNullishCoalesceEnds = 0;
      this.isOptionalChainStart = false;
      this.isOptionalChainEnd = false;
      this.subscriptStartIndex = null;
      this.nullishStartIndex = null;
    }
    // Initially false for all tokens, then may be computed in a follow-up step that does scope
    // analysis.
    // Initially false for all tokens, but may be set during transform to mark it as containing an
    // await operation.
    // For assignments, the index of the RHS. For export tokens, the end of the export.
    // For class tokens, records if the class is a class expression or a class statement.
    // Number of times to insert a `nullishCoalesce(` snippet before this token.
    // Number of times to insert a `)` snippet after this token.
    // If true, insert an `optionalChain([` snippet before this token.
    // If true, insert a `])` snippet after this token.
    // Tag for `.`, `?.`, `[`, `?.[`, `(`, and `?.(` to denote the "root" token for this
    // subscript chain. This can be used to determine if this chain is an optional chain.
    // Tag for `??` operators to denote the root token for this nullish coalescing call.
  };
  function next() {
    state.tokens.push(new Token3());
    nextToken();
  }
  function nextTemplateToken() {
    state.tokens.push(new Token3());
    state.start = state.pos;
    readTmplToken();
  }
  function retokenizeSlashAsRegex() {
    if (state.type === TokenType3.assign) {
      --state.pos;
    }
    readRegexp();
  }
  function pushTypeContext(existingTokensInType) {
    for (let i = state.tokens.length - existingTokensInType; i < state.tokens.length; i++) {
      state.tokens[i].isType = true;
    }
    const oldIsType = state.isType;
    state.isType = true;
    return oldIsType;
  }
  function popTypeContext(oldIsType) {
    state.isType = oldIsType;
  }
  function eat2(type) {
    if (match(type)) {
      next();
      return true;
    } else {
      return false;
    }
  }
  function eatTypeToken(tokenType) {
    const oldIsType = state.isType;
    state.isType = true;
    eat2(tokenType);
    state.isType = oldIsType;
  }
  function match(type) {
    return state.type === type;
  }
  function lookaheadType() {
    const snapshot = state.snapshot();
    next();
    const type = state.type;
    state.restoreFromSnapshot(snapshot);
    return type;
  }
  var TypeAndKeyword = class {
    constructor(type, contextualKeyword) {
      this.type = type;
      this.contextualKeyword = contextualKeyword;
    }
  };
  function lookaheadTypeAndKeyword() {
    const snapshot = state.snapshot();
    next();
    const type = state.type;
    const contextualKeyword = state.contextualKeyword;
    state.restoreFromSnapshot(snapshot);
    return new TypeAndKeyword(type, contextualKeyword);
  }
  function nextTokenStart() {
    return nextTokenStartSince(state.pos);
  }
  function nextTokenStartSince(pos) {
    skipWhiteSpace2.lastIndex = pos;
    const skip = skipWhiteSpace2.exec(input);
    return pos + skip[0].length;
  }
  function lookaheadCharCode() {
    return input.charCodeAt(nextTokenStart());
  }
  function nextToken() {
    skipSpace();
    state.start = state.pos;
    if (state.pos >= input.length) {
      const tokens = state.tokens;
      if (tokens.length >= 2 && tokens[tokens.length - 1].start >= input.length && tokens[tokens.length - 2].start >= input.length) {
        unexpected("Unexpectedly reached the end of input.");
      }
      finishToken(TokenType3.eof);
      return;
    }
    readToken(input.charCodeAt(state.pos));
  }
  function readToken(code) {
    if (IS_IDENTIFIER_START[code] || code === charCodes.backslash || code === charCodes.atSign && input.charCodeAt(state.pos + 1) === charCodes.atSign) {
      readWord();
    } else {
      getTokenFromCode(code);
    }
  }
  function skipBlockComment() {
    while (input.charCodeAt(state.pos) !== charCodes.asterisk || input.charCodeAt(state.pos + 1) !== charCodes.slash) {
      state.pos++;
      if (state.pos > input.length) {
        unexpected("Unterminated comment", state.pos - 2);
        return;
      }
    }
    state.pos += 2;
  }
  function skipLineComment(startSkip) {
    let ch = input.charCodeAt(state.pos += startSkip);
    if (state.pos < input.length) {
      while (ch !== charCodes.lineFeed && ch !== charCodes.carriageReturn && ch !== charCodes.lineSeparator && ch !== charCodes.paragraphSeparator && ++state.pos < input.length) {
        ch = input.charCodeAt(state.pos);
      }
    }
  }
  function skipSpace() {
    while (state.pos < input.length) {
      const ch = input.charCodeAt(state.pos);
      switch (ch) {
        case charCodes.carriageReturn:
          if (input.charCodeAt(state.pos + 1) === charCodes.lineFeed) {
            ++state.pos;
          }
        case charCodes.lineFeed:
        case charCodes.lineSeparator:
        case charCodes.paragraphSeparator:
          ++state.pos;
          break;
        case charCodes.slash:
          switch (input.charCodeAt(state.pos + 1)) {
            case charCodes.asterisk:
              state.pos += 2;
              skipBlockComment();
              break;
            case charCodes.slash:
              skipLineComment(2);
              break;
            default:
              return;
          }
          break;
        default:
          if (IS_WHITESPACE[ch]) {
            ++state.pos;
          } else {
            return;
          }
      }
    }
  }
  function finishToken(type, contextualKeyword = ContextualKeyword.NONE) {
    state.end = state.pos;
    state.type = type;
    state.contextualKeyword = contextualKeyword;
  }
  function readToken_dot() {
    const nextChar = input.charCodeAt(state.pos + 1);
    if (nextChar >= charCodes.digit0 && nextChar <= charCodes.digit9) {
      readNumber(true);
      return;
    }
    if (nextChar === charCodes.dot && input.charCodeAt(state.pos + 2) === charCodes.dot) {
      state.pos += 3;
      finishToken(TokenType3.ellipsis);
    } else {
      ++state.pos;
      finishToken(TokenType3.dot);
    }
  }
  function readToken_slash() {
    const nextChar = input.charCodeAt(state.pos + 1);
    if (nextChar === charCodes.equalsTo) {
      finishOp(TokenType3.assign, 2);
    } else {
      finishOp(TokenType3.slash, 1);
    }
  }
  function readToken_mult_modulo(code) {
    let tokenType = code === charCodes.asterisk ? TokenType3.star : TokenType3.modulo;
    let width = 1;
    let nextChar = input.charCodeAt(state.pos + 1);
    if (code === charCodes.asterisk && nextChar === charCodes.asterisk) {
      width++;
      nextChar = input.charCodeAt(state.pos + 2);
      tokenType = TokenType3.exponent;
    }
    if (nextChar === charCodes.equalsTo && input.charCodeAt(state.pos + 2) !== charCodes.greaterThan) {
      width++;
      tokenType = TokenType3.assign;
    }
    finishOp(tokenType, width);
  }
  function readToken_pipe_amp(code) {
    const nextChar = input.charCodeAt(state.pos + 1);
    if (nextChar === code) {
      if (input.charCodeAt(state.pos + 2) === charCodes.equalsTo) {
        finishOp(TokenType3.assign, 3);
      } else {
        finishOp(code === charCodes.verticalBar ? TokenType3.logicalOR : TokenType3.logicalAND, 2);
      }
      return;
    }
    if (code === charCodes.verticalBar) {
      if (nextChar === charCodes.greaterThan) {
        finishOp(TokenType3.pipeline, 2);
        return;
      } else if (nextChar === charCodes.rightCurlyBrace && isFlowEnabled) {
        finishOp(TokenType3.braceBarR, 2);
        return;
      }
    }
    if (nextChar === charCodes.equalsTo) {
      finishOp(TokenType3.assign, 2);
      return;
    }
    finishOp(code === charCodes.verticalBar ? TokenType3.bitwiseOR : TokenType3.bitwiseAND, 1);
  }
  function readToken_caret() {
    const nextChar = input.charCodeAt(state.pos + 1);
    if (nextChar === charCodes.equalsTo) {
      finishOp(TokenType3.assign, 2);
    } else {
      finishOp(TokenType3.bitwiseXOR, 1);
    }
  }
  function readToken_plus_min(code) {
    const nextChar = input.charCodeAt(state.pos + 1);
    if (nextChar === code) {
      finishOp(TokenType3.preIncDec, 2);
      return;
    }
    if (nextChar === charCodes.equalsTo) {
      finishOp(TokenType3.assign, 2);
    } else if (code === charCodes.plusSign) {
      finishOp(TokenType3.plus, 1);
    } else {
      finishOp(TokenType3.minus, 1);
    }
  }
  function readToken_lt() {
    const nextChar = input.charCodeAt(state.pos + 1);
    if (nextChar === charCodes.lessThan) {
      if (input.charCodeAt(state.pos + 2) === charCodes.equalsTo) {
        finishOp(TokenType3.assign, 3);
        return;
      }
      if (state.isType) {
        finishOp(TokenType3.lessThan, 1);
      } else {
        finishOp(TokenType3.bitShiftL, 2);
      }
      return;
    }
    if (nextChar === charCodes.equalsTo) {
      finishOp(TokenType3.relationalOrEqual, 2);
    } else {
      finishOp(TokenType3.lessThan, 1);
    }
  }
  function readToken_gt() {
    if (state.isType) {
      finishOp(TokenType3.greaterThan, 1);
      return;
    }
    const nextChar = input.charCodeAt(state.pos + 1);
    if (nextChar === charCodes.greaterThan) {
      const size = input.charCodeAt(state.pos + 2) === charCodes.greaterThan ? 3 : 2;
      if (input.charCodeAt(state.pos + size) === charCodes.equalsTo) {
        finishOp(TokenType3.assign, size + 1);
        return;
      }
      finishOp(TokenType3.bitShiftR, size);
      return;
    }
    if (nextChar === charCodes.equalsTo) {
      finishOp(TokenType3.relationalOrEqual, 2);
    } else {
      finishOp(TokenType3.greaterThan, 1);
    }
  }
  function rescan_gt() {
    if (state.type === TokenType3.greaterThan) {
      state.pos -= 1;
      readToken_gt();
    }
  }
  function readToken_eq_excl(code) {
    const nextChar = input.charCodeAt(state.pos + 1);
    if (nextChar === charCodes.equalsTo) {
      finishOp(TokenType3.equality, input.charCodeAt(state.pos + 2) === charCodes.equalsTo ? 3 : 2);
      return;
    }
    if (code === charCodes.equalsTo && nextChar === charCodes.greaterThan) {
      state.pos += 2;
      finishToken(TokenType3.arrow);
      return;
    }
    finishOp(code === charCodes.equalsTo ? TokenType3.eq : TokenType3.bang, 1);
  }
  function readToken_question() {
    const nextChar = input.charCodeAt(state.pos + 1);
    const nextChar2 = input.charCodeAt(state.pos + 2);
    if (nextChar === charCodes.questionMark && // In Flow (but not TypeScript), ??string is a valid type that should be
    // tokenized as two individual ? tokens.
    !(isFlowEnabled && state.isType)) {
      if (nextChar2 === charCodes.equalsTo) {
        finishOp(TokenType3.assign, 3);
      } else {
        finishOp(TokenType3.nullishCoalescing, 2);
      }
    } else if (nextChar === charCodes.dot && !(nextChar2 >= charCodes.digit0 && nextChar2 <= charCodes.digit9)) {
      state.pos += 2;
      finishToken(TokenType3.questionDot);
    } else {
      ++state.pos;
      finishToken(TokenType3.question);
    }
  }
  function getTokenFromCode(code) {
    switch (code) {
      case charCodes.numberSign:
        ++state.pos;
        finishToken(TokenType3.hash);
        return;
      // The interpretation of a dot depends on whether it is followed
      // by a digit or another two dots.
      case charCodes.dot:
        readToken_dot();
        return;
      // Punctuation tokens.
      case charCodes.leftParenthesis:
        ++state.pos;
        finishToken(TokenType3.parenL);
        return;
      case charCodes.rightParenthesis:
        ++state.pos;
        finishToken(TokenType3.parenR);
        return;
      case charCodes.semicolon:
        ++state.pos;
        finishToken(TokenType3.semi);
        return;
      case charCodes.comma:
        ++state.pos;
        finishToken(TokenType3.comma);
        return;
      case charCodes.leftSquareBracket:
        ++state.pos;
        finishToken(TokenType3.bracketL);
        return;
      case charCodes.rightSquareBracket:
        ++state.pos;
        finishToken(TokenType3.bracketR);
        return;
      case charCodes.leftCurlyBrace:
        if (isFlowEnabled && input.charCodeAt(state.pos + 1) === charCodes.verticalBar) {
          finishOp(TokenType3.braceBarL, 2);
        } else {
          ++state.pos;
          finishToken(TokenType3.braceL);
        }
        return;
      case charCodes.rightCurlyBrace:
        ++state.pos;
        finishToken(TokenType3.braceR);
        return;
      case charCodes.colon:
        if (input.charCodeAt(state.pos + 1) === charCodes.colon) {
          finishOp(TokenType3.doubleColon, 2);
        } else {
          ++state.pos;
          finishToken(TokenType3.colon);
        }
        return;
      case charCodes.questionMark:
        readToken_question();
        return;
      case charCodes.atSign:
        ++state.pos;
        finishToken(TokenType3.at);
        return;
      case charCodes.graveAccent:
        ++state.pos;
        finishToken(TokenType3.backQuote);
        return;
      case charCodes.digit0: {
        const nextChar = input.charCodeAt(state.pos + 1);
        if (nextChar === charCodes.lowercaseX || nextChar === charCodes.uppercaseX || nextChar === charCodes.lowercaseO || nextChar === charCodes.uppercaseO || nextChar === charCodes.lowercaseB || nextChar === charCodes.uppercaseB) {
          readRadixNumber();
          return;
        }
      }
      // Anything else beginning with a digit is an integer, octal
      // number, or float.
      case charCodes.digit1:
      case charCodes.digit2:
      case charCodes.digit3:
      case charCodes.digit4:
      case charCodes.digit5:
      case charCodes.digit6:
      case charCodes.digit7:
      case charCodes.digit8:
      case charCodes.digit9:
        readNumber(false);
        return;
      // Quotes produce strings.
      case charCodes.quotationMark:
      case charCodes.apostrophe:
        readString(code);
        return;
      // Operators are parsed inline in tiny state machines. '=' (charCodes.equalsTo) is
      // often referred to. `finishOp` simply skips the amount of
      // characters it is given as second argument, and returns a token
      // of the type given by its first argument.
      case charCodes.slash:
        readToken_slash();
        return;
      case charCodes.percentSign:
      case charCodes.asterisk:
        readToken_mult_modulo(code);
        return;
      case charCodes.verticalBar:
      case charCodes.ampersand:
        readToken_pipe_amp(code);
        return;
      case charCodes.caret:
        readToken_caret();
        return;
      case charCodes.plusSign:
      case charCodes.dash:
        readToken_plus_min(code);
        return;
      case charCodes.lessThan:
        readToken_lt();
        return;
      case charCodes.greaterThan:
        readToken_gt();
        return;
      case charCodes.equalsTo:
      case charCodes.exclamationMark:
        readToken_eq_excl(code);
        return;
      case charCodes.tilde:
        finishOp(TokenType3.tilde, 1);
        return;
      default:
        break;
    }
    unexpected(`Unexpected character '${String.fromCharCode(code)}'`, state.pos);
  }
  function finishOp(type, size) {
    state.pos += size;
    finishToken(type);
  }
  function readRegexp() {
    const start = state.pos;
    let escaped = false;
    let inClass = false;
    for (; ; ) {
      if (state.pos >= input.length) {
        unexpected("Unterminated regular expression", start);
        return;
      }
      const code = input.charCodeAt(state.pos);
      if (escaped) {
        escaped = false;
      } else {
        if (code === charCodes.leftSquareBracket) {
          inClass = true;
        } else if (code === charCodes.rightSquareBracket && inClass) {
          inClass = false;
        } else if (code === charCodes.slash && !inClass) {
          break;
        }
        escaped = code === charCodes.backslash;
      }
      ++state.pos;
    }
    ++state.pos;
    skipWord();
    finishToken(TokenType3.regexp);
  }
  function readInt() {
    while (true) {
      const code = input.charCodeAt(state.pos);
      if (code >= charCodes.digit0 && code <= charCodes.digit9 || code === charCodes.underscore) {
        state.pos++;
      } else {
        break;
      }
    }
  }
  function readRadixNumber() {
    state.pos += 2;
    while (true) {
      const code = input.charCodeAt(state.pos);
      if (code >= charCodes.digit0 && code <= charCodes.digit9 || code >= charCodes.lowercaseA && code <= charCodes.lowercaseF || code >= charCodes.uppercaseA && code <= charCodes.uppercaseF || code === charCodes.underscore) {
        state.pos++;
      } else {
        break;
      }
    }
    const nextChar = input.charCodeAt(state.pos);
    if (nextChar === charCodes.lowercaseN) {
      ++state.pos;
      finishToken(TokenType3.bigint);
    } else {
      finishToken(TokenType3.num);
    }
  }
  function readNumber(startsWithDot) {
    let isBigInt = false;
    let isDecimal = false;
    if (!startsWithDot) {
      readInt();
    }
    let nextChar = input.charCodeAt(state.pos);
    if (nextChar === charCodes.dot) {
      ++state.pos;
      readInt();
      nextChar = input.charCodeAt(state.pos);
    }
    if (nextChar === charCodes.uppercaseE || nextChar === charCodes.lowercaseE) {
      nextChar = input.charCodeAt(++state.pos);
      if (nextChar === charCodes.plusSign || nextChar === charCodes.dash) {
        ++state.pos;
      }
      readInt();
      nextChar = input.charCodeAt(state.pos);
    }
    if (nextChar === charCodes.lowercaseN) {
      ++state.pos;
      isBigInt = true;
    } else if (nextChar === charCodes.lowercaseM) {
      ++state.pos;
      isDecimal = true;
    }
    if (isBigInt) {
      finishToken(TokenType3.bigint);
      return;
    }
    if (isDecimal) {
      finishToken(TokenType3.decimal);
      return;
    }
    finishToken(TokenType3.num);
  }
  function readString(quote) {
    state.pos++;
    for (; ; ) {
      if (state.pos >= input.length) {
        unexpected("Unterminated string constant");
        return;
      }
      const ch = input.charCodeAt(state.pos);
      if (ch === charCodes.backslash) {
        state.pos++;
      } else if (ch === quote) {
        break;
      }
      state.pos++;
    }
    state.pos++;
    finishToken(TokenType3.string);
  }
  function readTmplToken() {
    for (; ; ) {
      if (state.pos >= input.length) {
        unexpected("Unterminated template");
        return;
      }
      const ch = input.charCodeAt(state.pos);
      if (ch === charCodes.graveAccent || ch === charCodes.dollarSign && input.charCodeAt(state.pos + 1) === charCodes.leftCurlyBrace) {
        if (state.pos === state.start && match(TokenType3.template)) {
          if (ch === charCodes.dollarSign) {
            state.pos += 2;
            finishToken(TokenType3.dollarBraceL);
            return;
          } else {
            ++state.pos;
            finishToken(TokenType3.backQuote);
            return;
          }
        }
        finishToken(TokenType3.template);
        return;
      }
      if (ch === charCodes.backslash) {
        state.pos++;
      }
      state.pos++;
    }
  }
  function skipWord() {
    while (state.pos < input.length) {
      const ch = input.charCodeAt(state.pos);
      if (IS_IDENTIFIER_CHAR[ch]) {
        state.pos++;
      } else if (ch === charCodes.backslash) {
        state.pos += 2;
        if (input.charCodeAt(state.pos) === charCodes.leftCurlyBrace) {
          while (state.pos < input.length && input.charCodeAt(state.pos) !== charCodes.rightCurlyBrace) {
            state.pos++;
          }
          state.pos++;
        }
      } else {
        break;
      }
    }
  }

  // node_modules/sucrase/dist/esm/util/getImportExportSpecifierInfo.js
  function getImportExportSpecifierInfo(tokens, index = tokens.currentIndex()) {
    let endIndex = index + 1;
    if (isSpecifierEnd(tokens, endIndex)) {
      const name = tokens.identifierNameAtIndex(index);
      return {
        isType: false,
        leftName: name,
        rightName: name,
        endIndex
      };
    }
    endIndex++;
    if (isSpecifierEnd(tokens, endIndex)) {
      return {
        isType: true,
        leftName: null,
        rightName: null,
        endIndex
      };
    }
    endIndex++;
    if (isSpecifierEnd(tokens, endIndex)) {
      return {
        isType: false,
        leftName: tokens.identifierNameAtIndex(index),
        rightName: tokens.identifierNameAtIndex(index + 2),
        endIndex
      };
    }
    endIndex++;
    if (isSpecifierEnd(tokens, endIndex)) {
      return {
        isType: true,
        leftName: null,
        rightName: null,
        endIndex
      };
    }
    throw new Error(`Unexpected import/export specifier at ${index}`);
  }
  function isSpecifierEnd(tokens, index) {
    const token = tokens.tokens[index];
    return token.type === TokenType3.braceR || token.type === TokenType3.comma;
  }

  // node_modules/sucrase/dist/esm/parser/plugins/jsx/xhtml.js
  var xhtml_default = /* @__PURE__ */ new Map([
    ["quot", '"'],
    ["amp", "&"],
    ["apos", "'"],
    ["lt", "<"],
    ["gt", ">"],
    ["nbsp", "\xA0"],
    ["iexcl", "\xA1"],
    ["cent", "\xA2"],
    ["pound", "\xA3"],
    ["curren", "\xA4"],
    ["yen", "\xA5"],
    ["brvbar", "\xA6"],
    ["sect", "\xA7"],
    ["uml", "\xA8"],
    ["copy", "\xA9"],
    ["ordf", "\xAA"],
    ["laquo", "\xAB"],
    ["not", "\xAC"],
    ["shy", "\xAD"],
    ["reg", "\xAE"],
    ["macr", "\xAF"],
    ["deg", "\xB0"],
    ["plusmn", "\xB1"],
    ["sup2", "\xB2"],
    ["sup3", "\xB3"],
    ["acute", "\xB4"],
    ["micro", "\xB5"],
    ["para", "\xB6"],
    ["middot", "\xB7"],
    ["cedil", "\xB8"],
    ["sup1", "\xB9"],
    ["ordm", "\xBA"],
    ["raquo", "\xBB"],
    ["frac14", "\xBC"],
    ["frac12", "\xBD"],
    ["frac34", "\xBE"],
    ["iquest", "\xBF"],
    ["Agrave", "\xC0"],
    ["Aacute", "\xC1"],
    ["Acirc", "\xC2"],
    ["Atilde", "\xC3"],
    ["Auml", "\xC4"],
    ["Aring", "\xC5"],
    ["AElig", "\xC6"],
    ["Ccedil", "\xC7"],
    ["Egrave", "\xC8"],
    ["Eacute", "\xC9"],
    ["Ecirc", "\xCA"],
    ["Euml", "\xCB"],
    ["Igrave", "\xCC"],
    ["Iacute", "\xCD"],
    ["Icirc", "\xCE"],
    ["Iuml", "\xCF"],
    ["ETH", "\xD0"],
    ["Ntilde", "\xD1"],
    ["Ograve", "\xD2"],
    ["Oacute", "\xD3"],
    ["Ocirc", "\xD4"],
    ["Otilde", "\xD5"],
    ["Ouml", "\xD6"],
    ["times", "\xD7"],
    ["Oslash", "\xD8"],
    ["Ugrave", "\xD9"],
    ["Uacute", "\xDA"],
    ["Ucirc", "\xDB"],
    ["Uuml", "\xDC"],
    ["Yacute", "\xDD"],
    ["THORN", "\xDE"],
    ["szlig", "\xDF"],
    ["agrave", "\xE0"],
    ["aacute", "\xE1"],
    ["acirc", "\xE2"],
    ["atilde", "\xE3"],
    ["auml", "\xE4"],
    ["aring", "\xE5"],
    ["aelig", "\xE6"],
    ["ccedil", "\xE7"],
    ["egrave", "\xE8"],
    ["eacute", "\xE9"],
    ["ecirc", "\xEA"],
    ["euml", "\xEB"],
    ["igrave", "\xEC"],
    ["iacute", "\xED"],
    ["icirc", "\xEE"],
    ["iuml", "\xEF"],
    ["eth", "\xF0"],
    ["ntilde", "\xF1"],
    ["ograve", "\xF2"],
    ["oacute", "\xF3"],
    ["ocirc", "\xF4"],
    ["otilde", "\xF5"],
    ["ouml", "\xF6"],
    ["divide", "\xF7"],
    ["oslash", "\xF8"],
    ["ugrave", "\xF9"],
    ["uacute", "\xFA"],
    ["ucirc", "\xFB"],
    ["uuml", "\xFC"],
    ["yacute", "\xFD"],
    ["thorn", "\xFE"],
    ["yuml", "\xFF"],
    ["OElig", "\u0152"],
    ["oelig", "\u0153"],
    ["Scaron", "\u0160"],
    ["scaron", "\u0161"],
    ["Yuml", "\u0178"],
    ["fnof", "\u0192"],
    ["circ", "\u02C6"],
    ["tilde", "\u02DC"],
    ["Alpha", "\u0391"],
    ["Beta", "\u0392"],
    ["Gamma", "\u0393"],
    ["Delta", "\u0394"],
    ["Epsilon", "\u0395"],
    ["Zeta", "\u0396"],
    ["Eta", "\u0397"],
    ["Theta", "\u0398"],
    ["Iota", "\u0399"],
    ["Kappa", "\u039A"],
    ["Lambda", "\u039B"],
    ["Mu", "\u039C"],
    ["Nu", "\u039D"],
    ["Xi", "\u039E"],
    ["Omicron", "\u039F"],
    ["Pi", "\u03A0"],
    ["Rho", "\u03A1"],
    ["Sigma", "\u03A3"],
    ["Tau", "\u03A4"],
    ["Upsilon", "\u03A5"],
    ["Phi", "\u03A6"],
    ["Chi", "\u03A7"],
    ["Psi", "\u03A8"],
    ["Omega", "\u03A9"],
    ["alpha", "\u03B1"],
    ["beta", "\u03B2"],
    ["gamma", "\u03B3"],
    ["delta", "\u03B4"],
    ["epsilon", "\u03B5"],
    ["zeta", "\u03B6"],
    ["eta", "\u03B7"],
    ["theta", "\u03B8"],
    ["iota", "\u03B9"],
    ["kappa", "\u03BA"],
    ["lambda", "\u03BB"],
    ["mu", "\u03BC"],
    ["nu", "\u03BD"],
    ["xi", "\u03BE"],
    ["omicron", "\u03BF"],
    ["pi", "\u03C0"],
    ["rho", "\u03C1"],
    ["sigmaf", "\u03C2"],
    ["sigma", "\u03C3"],
    ["tau", "\u03C4"],
    ["upsilon", "\u03C5"],
    ["phi", "\u03C6"],
    ["chi", "\u03C7"],
    ["psi", "\u03C8"],
    ["omega", "\u03C9"],
    ["thetasym", "\u03D1"],
    ["upsih", "\u03D2"],
    ["piv", "\u03D6"],
    ["ensp", "\u2002"],
    ["emsp", "\u2003"],
    ["thinsp", "\u2009"],
    ["zwnj", "\u200C"],
    ["zwj", "\u200D"],
    ["lrm", "\u200E"],
    ["rlm", "\u200F"],
    ["ndash", "\u2013"],
    ["mdash", "\u2014"],
    ["lsquo", "\u2018"],
    ["rsquo", "\u2019"],
    ["sbquo", "\u201A"],
    ["ldquo", "\u201C"],
    ["rdquo", "\u201D"],
    ["bdquo", "\u201E"],
    ["dagger", "\u2020"],
    ["Dagger", "\u2021"],
    ["bull", "\u2022"],
    ["hellip", "\u2026"],
    ["permil", "\u2030"],
    ["prime", "\u2032"],
    ["Prime", "\u2033"],
    ["lsaquo", "\u2039"],
    ["rsaquo", "\u203A"],
    ["oline", "\u203E"],
    ["frasl", "\u2044"],
    ["euro", "\u20AC"],
    ["image", "\u2111"],
    ["weierp", "\u2118"],
    ["real", "\u211C"],
    ["trade", "\u2122"],
    ["alefsym", "\u2135"],
    ["larr", "\u2190"],
    ["uarr", "\u2191"],
    ["rarr", "\u2192"],
    ["darr", "\u2193"],
    ["harr", "\u2194"],
    ["crarr", "\u21B5"],
    ["lArr", "\u21D0"],
    ["uArr", "\u21D1"],
    ["rArr", "\u21D2"],
    ["dArr", "\u21D3"],
    ["hArr", "\u21D4"],
    ["forall", "\u2200"],
    ["part", "\u2202"],
    ["exist", "\u2203"],
    ["empty", "\u2205"],
    ["nabla", "\u2207"],
    ["isin", "\u2208"],
    ["notin", "\u2209"],
    ["ni", "\u220B"],
    ["prod", "\u220F"],
    ["sum", "\u2211"],
    ["minus", "\u2212"],
    ["lowast", "\u2217"],
    ["radic", "\u221A"],
    ["prop", "\u221D"],
    ["infin", "\u221E"],
    ["ang", "\u2220"],
    ["and", "\u2227"],
    ["or", "\u2228"],
    ["cap", "\u2229"],
    ["cup", "\u222A"],
    ["int", "\u222B"],
    ["there4", "\u2234"],
    ["sim", "\u223C"],
    ["cong", "\u2245"],
    ["asymp", "\u2248"],
    ["ne", "\u2260"],
    ["equiv", "\u2261"],
    ["le", "\u2264"],
    ["ge", "\u2265"],
    ["sub", "\u2282"],
    ["sup", "\u2283"],
    ["nsub", "\u2284"],
    ["sube", "\u2286"],
    ["supe", "\u2287"],
    ["oplus", "\u2295"],
    ["otimes", "\u2297"],
    ["perp", "\u22A5"],
    ["sdot", "\u22C5"],
    ["lceil", "\u2308"],
    ["rceil", "\u2309"],
    ["lfloor", "\u230A"],
    ["rfloor", "\u230B"],
    ["lang", "\u2329"],
    ["rang", "\u232A"],
    ["loz", "\u25CA"],
    ["spades", "\u2660"],
    ["clubs", "\u2663"],
    ["hearts", "\u2665"],
    ["diams", "\u2666"]
  ]);

  // node_modules/sucrase/dist/esm/util/getJSXPragmaInfo.js
  function getJSXPragmaInfo(options) {
    const [base, suffix] = splitPragma(options.jsxPragma || "React.createElement");
    const [fragmentBase, fragmentSuffix] = splitPragma(options.jsxFragmentPragma || "React.Fragment");
    return { base, suffix, fragmentBase, fragmentSuffix };
  }
  function splitPragma(pragma) {
    let dotIndex = pragma.indexOf(".");
    if (dotIndex === -1) {
      dotIndex = pragma.length;
    }
    return [pragma.slice(0, dotIndex), pragma.slice(dotIndex)];
  }

  // node_modules/sucrase/dist/esm/transformers/Transformer.js
  var Transformer = class {
    // Return true if anything was processed, false otherwise.
    getPrefixCode() {
      return "";
    }
    getHoistedCode() {
      return "";
    }
    getSuffixCode() {
      return "";
    }
  };

  // node_modules/sucrase/dist/esm/transformers/JSXTransformer.js
  var JSXTransformer = class _JSXTransformer extends Transformer {
    // State for calculating the line number of each JSX tag in development.
    __init() {
      this.lastLineNumber = 1;
    }
    __init2() {
      this.lastIndex = 0;
    }
    // In development, variable name holding the name of the current file.
    __init3() {
      this.filenameVarName = null;
    }
    // Mapping of claimed names for imports in the automatic transform, e,g.
    // {jsx: "_jsx"}. This determines which imports to generate in the prefix.
    __init4() {
      this.esmAutomaticImportNameResolutions = {};
    }
    // When automatically adding imports in CJS mode, we store the variable name
    // holding the imported CJS module so we can require it in the prefix.
    __init5() {
      this.cjsAutomaticModuleNameResolutions = {};
    }
    constructor(rootTransformer, tokens, importProcessor, nameManager, options) {
      super();
      this.rootTransformer = rootTransformer;
      this.tokens = tokens;
      this.importProcessor = importProcessor;
      this.nameManager = nameManager;
      this.options = options;
      _JSXTransformer.prototype.__init.call(this);
      _JSXTransformer.prototype.__init2.call(this);
      _JSXTransformer.prototype.__init3.call(this);
      _JSXTransformer.prototype.__init4.call(this);
      _JSXTransformer.prototype.__init5.call(this);
      ;
      this.jsxPragmaInfo = getJSXPragmaInfo(options);
      this.isAutomaticRuntime = options.jsxRuntime === "automatic";
      this.jsxImportSource = options.jsxImportSource || "react";
    }
    process() {
      if (this.tokens.matches1(TokenType3.jsxTagStart)) {
        this.processJSXTag();
        return true;
      }
      return false;
    }
    getPrefixCode() {
      let prefix = "";
      if (this.filenameVarName) {
        prefix += `const ${this.filenameVarName} = ${JSON.stringify(this.options.filePath || "")};`;
      }
      if (this.isAutomaticRuntime) {
        if (this.importProcessor) {
          for (const [path, resolvedName] of Object.entries(this.cjsAutomaticModuleNameResolutions)) {
            prefix += `var ${resolvedName} = require("${path}");`;
          }
        } else {
          const { createElement: createElementResolution, ...otherResolutions } = this.esmAutomaticImportNameResolutions;
          if (createElementResolution) {
            prefix += `import {createElement as ${createElementResolution}} from "${this.jsxImportSource}";`;
          }
          const importSpecifiers = Object.entries(otherResolutions).map(([name, resolvedName]) => `${name} as ${resolvedName}`).join(", ");
          if (importSpecifiers) {
            const importPath = this.jsxImportSource + (this.options.production ? "/jsx-runtime" : "/jsx-dev-runtime");
            prefix += `import {${importSpecifiers}} from "${importPath}";`;
          }
        }
      }
      return prefix;
    }
    processJSXTag() {
      const { jsxRole, start } = this.tokens.currentToken();
      const elementLocationCode = this.options.production ? null : this.getElementLocationCode(start);
      if (this.isAutomaticRuntime && jsxRole !== JSXRole.KeyAfterPropSpread) {
        this.transformTagToJSXFunc(elementLocationCode, jsxRole);
      } else {
        this.transformTagToCreateElement(elementLocationCode);
      }
    }
    getElementLocationCode(firstTokenStart) {
      const lineNumber = this.getLineNumberForIndex(firstTokenStart);
      return `lineNumber: ${lineNumber}`;
    }
    /**
     * Get the line number for this source position. This is calculated lazily and
     * must be called in increasing order by index.
     */
    getLineNumberForIndex(index) {
      const code = this.tokens.code;
      while (this.lastIndex < index && this.lastIndex < code.length) {
        if (code[this.lastIndex] === "\n") {
          this.lastLineNumber++;
        }
        this.lastIndex++;
      }
      return this.lastLineNumber;
    }
    /**
     * Convert the current JSX element to a call to jsx, jsxs, or jsxDEV. This is
     * the primary transformation for the automatic transform.
     *
     * Example:
     * <div a={1} key={2}>Hello{x}</div>
     * becomes
     * jsxs('div', {a: 1, children: ["Hello", x]}, 2)
     */
    transformTagToJSXFunc(elementLocationCode, jsxRole) {
      const isStatic = jsxRole === JSXRole.StaticChildren;
      this.tokens.replaceToken(this.getJSXFuncInvocationCode(isStatic));
      let keyCode = null;
      if (this.tokens.matches1(TokenType3.jsxTagEnd)) {
        this.tokens.replaceToken(`${this.getFragmentCode()}, {`);
        this.processAutomaticChildrenAndEndProps(jsxRole);
      } else {
        this.processTagIntro();
        this.tokens.appendCode(", {");
        keyCode = this.processProps(true);
        if (this.tokens.matches2(TokenType3.slash, TokenType3.jsxTagEnd)) {
          this.tokens.appendCode("}");
        } else if (this.tokens.matches1(TokenType3.jsxTagEnd)) {
          this.tokens.removeToken();
          this.processAutomaticChildrenAndEndProps(jsxRole);
        } else {
          throw new Error("Expected either /> or > at the end of the tag.");
        }
        if (keyCode) {
          this.tokens.appendCode(`, ${keyCode}`);
        }
      }
      if (!this.options.production) {
        if (keyCode === null) {
          this.tokens.appendCode(", void 0");
        }
        this.tokens.appendCode(`, ${isStatic}, ${this.getDevSource(elementLocationCode)}, this`);
      }
      this.tokens.removeInitialToken();
      while (!this.tokens.matches1(TokenType3.jsxTagEnd)) {
        this.tokens.removeToken();
      }
      this.tokens.replaceToken(")");
    }
    /**
     * Convert the current JSX element to a createElement call. In the classic
     * runtime, this is the only case. In the automatic runtime, this is called
     * as a fallback in some situations.
     *
     * Example:
     * <div a={1} key={2}>Hello{x}</div>
     * becomes
     * React.createElement('div', {a: 1, key: 2}, "Hello", x)
     */
    transformTagToCreateElement(elementLocationCode) {
      this.tokens.replaceToken(this.getCreateElementInvocationCode());
      if (this.tokens.matches1(TokenType3.jsxTagEnd)) {
        this.tokens.replaceToken(`${this.getFragmentCode()}, null`);
        this.processChildren(true);
      } else {
        this.processTagIntro();
        this.processPropsObjectWithDevInfo(elementLocationCode);
        if (this.tokens.matches2(TokenType3.slash, TokenType3.jsxTagEnd)) {
        } else if (this.tokens.matches1(TokenType3.jsxTagEnd)) {
          this.tokens.removeToken();
          this.processChildren(true);
        } else {
          throw new Error("Expected either /> or > at the end of the tag.");
        }
      }
      this.tokens.removeInitialToken();
      while (!this.tokens.matches1(TokenType3.jsxTagEnd)) {
        this.tokens.removeToken();
      }
      this.tokens.replaceToken(")");
    }
    /**
     * Get the code for the relevant function for this context: jsx, jsxs,
     * or jsxDEV. The following open-paren is included as well.
     *
     * These functions are only used for the automatic runtime, so they are always
     * auto-imported, but the auto-import will be either CJS or ESM based on the
     * target module format.
     */
    getJSXFuncInvocationCode(isStatic) {
      if (this.options.production) {
        if (isStatic) {
          return this.claimAutoImportedFuncInvocation("jsxs", "/jsx-runtime");
        } else {
          return this.claimAutoImportedFuncInvocation("jsx", "/jsx-runtime");
        }
      } else {
        return this.claimAutoImportedFuncInvocation("jsxDEV", "/jsx-dev-runtime");
      }
    }
    /**
     * Return the code to use for the createElement function, e.g.
     * `React.createElement`, including the following open-paren.
     *
     * This is the main function to use for the classic runtime. For the
     * automatic runtime, this function is used as a fallback function to
     * preserve behavior when there is a prop spread followed by an explicit
     * key. In that automatic runtime case, the function should be automatically
     * imported.
     */
    getCreateElementInvocationCode() {
      if (this.isAutomaticRuntime) {
        return this.claimAutoImportedFuncInvocation("createElement", "");
      } else {
        const { jsxPragmaInfo } = this;
        const resolvedPragmaBaseName = this.importProcessor ? this.importProcessor.getIdentifierReplacement(jsxPragmaInfo.base) || jsxPragmaInfo.base : jsxPragmaInfo.base;
        return `${resolvedPragmaBaseName}${jsxPragmaInfo.suffix}(`;
      }
    }
    /**
     * Return the code to use as the component when compiling a shorthand
     * fragment, e.g. `React.Fragment`.
     *
     * This may be called from either the classic or automatic runtime, and
     * the value should be auto-imported for the automatic runtime.
     */
    getFragmentCode() {
      if (this.isAutomaticRuntime) {
        return this.claimAutoImportedName(
          "Fragment",
          this.options.production ? "/jsx-runtime" : "/jsx-dev-runtime"
        );
      } else {
        const { jsxPragmaInfo } = this;
        const resolvedFragmentPragmaBaseName = this.importProcessor ? this.importProcessor.getIdentifierReplacement(jsxPragmaInfo.fragmentBase) || jsxPragmaInfo.fragmentBase : jsxPragmaInfo.fragmentBase;
        return resolvedFragmentPragmaBaseName + jsxPragmaInfo.fragmentSuffix;
      }
    }
    /**
     * Return code that invokes the given function.
     *
     * When the imports transform is enabled, use the CJSImportTransformer
     * strategy of using `.call(void 0, ...` to avoid passing a `this` value in a
     * situation that would otherwise look like a method call.
     */
    claimAutoImportedFuncInvocation(funcName, importPathSuffix) {
      const funcCode = this.claimAutoImportedName(funcName, importPathSuffix);
      if (this.importProcessor) {
        return `${funcCode}.call(void 0, `;
      } else {
        return `${funcCode}(`;
      }
    }
    claimAutoImportedName(funcName, importPathSuffix) {
      if (this.importProcessor) {
        const path = this.jsxImportSource + importPathSuffix;
        if (!this.cjsAutomaticModuleNameResolutions[path]) {
          this.cjsAutomaticModuleNameResolutions[path] = this.importProcessor.getFreeIdentifierForPath(path);
        }
        return `${this.cjsAutomaticModuleNameResolutions[path]}.${funcName}`;
      } else {
        if (!this.esmAutomaticImportNameResolutions[funcName]) {
          this.esmAutomaticImportNameResolutions[funcName] = this.nameManager.claimFreeName(
            `_${funcName}`
          );
        }
        return this.esmAutomaticImportNameResolutions[funcName];
      }
    }
    /**
     * Process the first part of a tag, before any props.
     */
    processTagIntro() {
      let introEnd = this.tokens.currentIndex() + 1;
      while (this.tokens.tokens[introEnd].isType || !this.tokens.matches2AtIndex(introEnd - 1, TokenType3.jsxName, TokenType3.jsxName) && !this.tokens.matches2AtIndex(introEnd - 1, TokenType3.greaterThan, TokenType3.jsxName) && !this.tokens.matches1AtIndex(introEnd, TokenType3.braceL) && !this.tokens.matches1AtIndex(introEnd, TokenType3.jsxTagEnd) && !this.tokens.matches2AtIndex(introEnd, TokenType3.slash, TokenType3.jsxTagEnd)) {
        introEnd++;
      }
      if (introEnd === this.tokens.currentIndex() + 1) {
        const tagName = this.tokens.identifierName();
        if (startsWithLowerCase(tagName)) {
          this.tokens.replaceToken(`'${tagName}'`);
        }
      }
      while (this.tokens.currentIndex() < introEnd) {
        this.rootTransformer.processToken();
      }
    }
    /**
     * Starting at the beginning of the props, add the props argument to
     * React.createElement, including the comma before it.
     */
    processPropsObjectWithDevInfo(elementLocationCode) {
      const devProps = this.options.production ? "" : `__self: this, __source: ${this.getDevSource(elementLocationCode)}`;
      if (!this.tokens.matches1(TokenType3.jsxName) && !this.tokens.matches1(TokenType3.braceL)) {
        if (devProps) {
          this.tokens.appendCode(`, {${devProps}}`);
        } else {
          this.tokens.appendCode(`, null`);
        }
        return;
      }
      this.tokens.appendCode(`, {`);
      this.processProps(false);
      if (devProps) {
        this.tokens.appendCode(` ${devProps}}`);
      } else {
        this.tokens.appendCode("}");
      }
    }
    /**
     * Transform the core part of the props, assuming that a { has already been
     * inserted before us and that a } will be inserted after us.
     *
     * If extractKeyCode is true (i.e. when using any jsx... function), any prop
     * named "key" has its code captured and returned rather than being emitted to
     * the output code. This shifts line numbers, and emitting the code later will
     * correct line numbers again. If no key is found or if extractKeyCode is
     * false, this function returns null.
     */
    processProps(extractKeyCode) {
      let keyCode = null;
      while (true) {
        if (this.tokens.matches2(TokenType3.jsxName, TokenType3.eq)) {
          const propName = this.tokens.identifierName();
          if (extractKeyCode && propName === "key") {
            if (keyCode !== null) {
              this.tokens.appendCode(keyCode.replace(/[^\n]/g, ""));
            }
            this.tokens.removeToken();
            this.tokens.removeToken();
            const snapshot = this.tokens.snapshot();
            this.processPropValue();
            keyCode = this.tokens.dangerouslyGetAndRemoveCodeSinceSnapshot(snapshot);
            continue;
          } else {
            this.processPropName(propName);
            this.tokens.replaceToken(": ");
            this.processPropValue();
          }
        } else if (this.tokens.matches1(TokenType3.jsxName)) {
          const propName = this.tokens.identifierName();
          this.processPropName(propName);
          this.tokens.appendCode(": true");
        } else if (this.tokens.matches1(TokenType3.braceL)) {
          this.tokens.replaceToken("");
          this.rootTransformer.processBalancedCode();
          this.tokens.replaceToken("");
        } else {
          break;
        }
        this.tokens.appendCode(",");
      }
      return keyCode;
    }
    processPropName(propName) {
      if (propName.includes("-")) {
        this.tokens.replaceToken(`'${propName}'`);
      } else {
        this.tokens.copyToken();
      }
    }
    processPropValue() {
      if (this.tokens.matches1(TokenType3.braceL)) {
        this.tokens.replaceToken("");
        this.rootTransformer.processBalancedCode();
        this.tokens.replaceToken("");
      } else if (this.tokens.matches1(TokenType3.jsxTagStart)) {
        this.processJSXTag();
      } else {
        this.processStringPropValue();
      }
    }
    processStringPropValue() {
      const token = this.tokens.currentToken();
      const valueCode = this.tokens.code.slice(token.start + 1, token.end - 1);
      const replacementCode = formatJSXTextReplacement(valueCode);
      const literalCode = formatJSXStringValueLiteral(valueCode);
      this.tokens.replaceToken(literalCode + replacementCode);
    }
    /**
     * Starting in the middle of the props object literal, produce an additional
     * prop for the children and close the object literal.
     */
    processAutomaticChildrenAndEndProps(jsxRole) {
      if (jsxRole === JSXRole.StaticChildren) {
        this.tokens.appendCode(" children: [");
        this.processChildren(false);
        this.tokens.appendCode("]}");
      } else {
        if (jsxRole === JSXRole.OneChild) {
          this.tokens.appendCode(" children: ");
        }
        this.processChildren(false);
        this.tokens.appendCode("}");
      }
    }
    /**
     * Transform children into a comma-separated list, which will be either
     * arguments to createElement or array elements of a children prop.
     */
    processChildren(needsInitialComma) {
      let needsComma = needsInitialComma;
      while (true) {
        if (this.tokens.matches2(TokenType3.jsxTagStart, TokenType3.slash)) {
          return;
        }
        let didEmitElement = false;
        if (this.tokens.matches1(TokenType3.braceL)) {
          if (this.tokens.matches2(TokenType3.braceL, TokenType3.braceR)) {
            this.tokens.replaceToken("");
            this.tokens.replaceToken("");
          } else {
            this.tokens.replaceToken(needsComma ? ", " : "");
            this.rootTransformer.processBalancedCode();
            this.tokens.replaceToken("");
            didEmitElement = true;
          }
        } else if (this.tokens.matches1(TokenType3.jsxTagStart)) {
          this.tokens.appendCode(needsComma ? ", " : "");
          this.processJSXTag();
          didEmitElement = true;
        } else if (this.tokens.matches1(TokenType3.jsxText) || this.tokens.matches1(TokenType3.jsxEmptyText)) {
          didEmitElement = this.processChildTextElement(needsComma);
        } else {
          throw new Error("Unexpected token when processing JSX children.");
        }
        if (didEmitElement) {
          needsComma = true;
        }
      }
    }
    /**
     * Turn a JSX text element into a string literal, or nothing at all if the JSX
     * text resolves to the empty string.
     *
     * Returns true if a string literal is emitted, false otherwise.
     */
    processChildTextElement(needsComma) {
      const token = this.tokens.currentToken();
      const valueCode = this.tokens.code.slice(token.start, token.end);
      const replacementCode = formatJSXTextReplacement(valueCode);
      const literalCode = formatJSXTextLiteral(valueCode);
      if (literalCode === '""') {
        this.tokens.replaceToken(replacementCode);
        return false;
      } else {
        this.tokens.replaceToken(`${needsComma ? ", " : ""}${literalCode}${replacementCode}`);
        return true;
      }
    }
    getDevSource(elementLocationCode) {
      return `{fileName: ${this.getFilenameVarName()}, ${elementLocationCode}}`;
    }
    getFilenameVarName() {
      if (!this.filenameVarName) {
        this.filenameVarName = this.nameManager.claimFreeName("_jsxFileName");
      }
      return this.filenameVarName;
    }
  };
  function startsWithLowerCase(s) {
    const firstChar = s.charCodeAt(0);
    return firstChar >= charCodes.lowercaseA && firstChar <= charCodes.lowercaseZ;
  }
  function formatJSXTextLiteral(text) {
    let result = "";
    let whitespace = "";
    let isInInitialLineWhitespace = false;
    let seenNonWhitespace = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === " " || c === "	" || c === "\r") {
        if (!isInInitialLineWhitespace) {
          whitespace += c;
        }
      } else if (c === "\n") {
        whitespace = "";
        isInInitialLineWhitespace = true;
      } else {
        if (seenNonWhitespace && isInInitialLineWhitespace) {
          result += " ";
        }
        result += whitespace;
        whitespace = "";
        if (c === "&") {
          const { entity, newI } = processEntity(text, i + 1);
          i = newI - 1;
          result += entity;
        } else {
          result += c;
        }
        seenNonWhitespace = true;
        isInInitialLineWhitespace = false;
      }
    }
    if (!isInInitialLineWhitespace) {
      result += whitespace;
    }
    return JSON.stringify(result);
  }
  function formatJSXTextReplacement(text) {
    let numNewlines = 0;
    let numSpaces = 0;
    for (const c of text) {
      if (c === "\n") {
        numNewlines++;
        numSpaces = 0;
      } else if (c === " ") {
        numSpaces++;
      }
    }
    return "\n".repeat(numNewlines) + " ".repeat(numSpaces);
  }
  function formatJSXStringValueLiteral(text) {
    let result = "";
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === "\n") {
        if (/\s/.test(text[i + 1])) {
          result += " ";
          while (i < text.length && /\s/.test(text[i + 1])) {
            i++;
          }
        } else {
          result += "\n";
        }
      } else if (c === "&") {
        const { entity, newI } = processEntity(text, i + 1);
        result += entity;
        i = newI - 1;
      } else {
        result += c;
      }
    }
    return JSON.stringify(result);
  }
  function processEntity(text, indexAfterAmpersand) {
    let str = "";
    let count = 0;
    let entity;
    let i = indexAfterAmpersand;
    if (text[i] === "#") {
      let radix = 10;
      i++;
      let numStart;
      if (text[i] === "x") {
        radix = 16;
        i++;
        numStart = i;
        while (i < text.length && isHexDigit2(text.charCodeAt(i))) {
          i++;
        }
      } else {
        numStart = i;
        while (i < text.length && isDecimalDigit2(text.charCodeAt(i))) {
          i++;
        }
      }
      if (text[i] === ";") {
        const numStr = text.slice(numStart, i);
        if (numStr) {
          i++;
          entity = String.fromCodePoint(parseInt(numStr, radix));
        }
      }
    } else {
      while (i < text.length && count++ < 10) {
        const ch = text[i];
        i++;
        if (ch === ";") {
          entity = xhtml_default.get(str);
          break;
        }
        str += ch;
      }
    }
    if (!entity) {
      return { entity: "&", newI: indexAfterAmpersand };
    }
    return { entity, newI: i };
  }
  function isDecimalDigit2(code) {
    return code >= charCodes.digit0 && code <= charCodes.digit9;
  }
  function isHexDigit2(code) {
    return code >= charCodes.digit0 && code <= charCodes.digit9 || code >= charCodes.lowercaseA && code <= charCodes.lowercaseF || code >= charCodes.uppercaseA && code <= charCodes.uppercaseF;
  }

  // node_modules/sucrase/dist/esm/util/getNonTypeIdentifiers.js
  function getNonTypeIdentifiers(tokens, options) {
    const jsxPragmaInfo = getJSXPragmaInfo(options);
    const nonTypeIdentifiers = /* @__PURE__ */ new Set();
    for (let i = 0; i < tokens.tokens.length; i++) {
      const token = tokens.tokens[i];
      if (token.type === TokenType3.name && !token.isType && (token.identifierRole === IdentifierRole.Access || token.identifierRole === IdentifierRole.ObjectShorthand || token.identifierRole === IdentifierRole.ExportAccess) && !token.shadowsGlobal) {
        nonTypeIdentifiers.add(tokens.identifierNameForToken(token));
      }
      if (token.type === TokenType3.jsxTagStart) {
        nonTypeIdentifiers.add(jsxPragmaInfo.base);
      }
      if (token.type === TokenType3.jsxTagStart && i + 1 < tokens.tokens.length && tokens.tokens[i + 1].type === TokenType3.jsxTagEnd) {
        nonTypeIdentifiers.add(jsxPragmaInfo.base);
        nonTypeIdentifiers.add(jsxPragmaInfo.fragmentBase);
      }
      if (token.type === TokenType3.jsxName && token.identifierRole === IdentifierRole.Access) {
        const identifierName = tokens.identifierNameForToken(token);
        if (!startsWithLowerCase(identifierName) || tokens.tokens[i + 1].type === TokenType3.dot) {
          nonTypeIdentifiers.add(tokens.identifierNameForToken(token));
        }
      }
    }
    return nonTypeIdentifiers;
  }

  // node_modules/sucrase/dist/esm/CJSImportProcessor.js
  var CJSImportProcessor = class _CJSImportProcessor {
    __init() {
      this.nonTypeIdentifiers = /* @__PURE__ */ new Set();
    }
    __init2() {
      this.importInfoByPath = /* @__PURE__ */ new Map();
    }
    __init3() {
      this.importsToReplace = /* @__PURE__ */ new Map();
    }
    __init4() {
      this.identifierReplacements = /* @__PURE__ */ new Map();
    }
    __init5() {
      this.exportBindingsByLocalName = /* @__PURE__ */ new Map();
    }
    constructor(nameManager, tokens, enableLegacyTypeScriptModuleInterop, options, isTypeScriptTransformEnabled, keepUnusedImports, helperManager) {
      ;
      this.nameManager = nameManager;
      this.tokens = tokens;
      this.enableLegacyTypeScriptModuleInterop = enableLegacyTypeScriptModuleInterop;
      this.options = options;
      this.isTypeScriptTransformEnabled = isTypeScriptTransformEnabled;
      this.keepUnusedImports = keepUnusedImports;
      this.helperManager = helperManager;
      _CJSImportProcessor.prototype.__init.call(this);
      _CJSImportProcessor.prototype.__init2.call(this);
      _CJSImportProcessor.prototype.__init3.call(this);
      _CJSImportProcessor.prototype.__init4.call(this);
      _CJSImportProcessor.prototype.__init5.call(this);
    }
    preprocessTokens() {
      for (let i = 0; i < this.tokens.tokens.length; i++) {
        if (this.tokens.matches1AtIndex(i, TokenType3._import) && !this.tokens.matches3AtIndex(i, TokenType3._import, TokenType3.name, TokenType3.eq)) {
          this.preprocessImportAtIndex(i);
        }
        if (this.tokens.matches1AtIndex(i, TokenType3._export) && !this.tokens.matches2AtIndex(i, TokenType3._export, TokenType3.eq)) {
          this.preprocessExportAtIndex(i);
        }
      }
      this.generateImportReplacements();
    }
    /**
     * In TypeScript, import statements that only import types should be removed.
     * This includes `import {} from 'foo';`, but not `import 'foo';`.
     */
    pruneTypeOnlyImports() {
      this.nonTypeIdentifiers = getNonTypeIdentifiers(this.tokens, this.options);
      for (const [path, importInfo] of this.importInfoByPath.entries()) {
        if (importInfo.hasBareImport || importInfo.hasStarExport || importInfo.exportStarNames.length > 0 || importInfo.namedExports.length > 0) {
          continue;
        }
        const names = [
          ...importInfo.defaultNames,
          ...importInfo.wildcardNames,
          ...importInfo.namedImports.map(({ localName }) => localName)
        ];
        if (names.every((name) => this.shouldAutomaticallyElideImportedName(name))) {
          this.importsToReplace.set(path, "");
        }
      }
    }
    shouldAutomaticallyElideImportedName(name) {
      return this.isTypeScriptTransformEnabled && !this.keepUnusedImports && !this.nonTypeIdentifiers.has(name);
    }
    generateImportReplacements() {
      for (const [path, importInfo] of this.importInfoByPath.entries()) {
        const {
          defaultNames,
          wildcardNames,
          namedImports,
          namedExports,
          exportStarNames,
          hasStarExport
        } = importInfo;
        if (defaultNames.length === 0 && wildcardNames.length === 0 && namedImports.length === 0 && namedExports.length === 0 && exportStarNames.length === 0 && !hasStarExport) {
          this.importsToReplace.set(path, `require('${path}');`);
          continue;
        }
        const primaryImportName = this.getFreeIdentifierForPath(path);
        let secondaryImportName;
        if (this.enableLegacyTypeScriptModuleInterop) {
          secondaryImportName = primaryImportName;
        } else {
          secondaryImportName = wildcardNames.length > 0 ? wildcardNames[0] : this.getFreeIdentifierForPath(path);
        }
        let requireCode = `var ${primaryImportName} = require('${path}');`;
        if (wildcardNames.length > 0) {
          for (const wildcardName of wildcardNames) {
            const moduleExpr = this.enableLegacyTypeScriptModuleInterop ? primaryImportName : `${this.helperManager.getHelperName("interopRequireWildcard")}(${primaryImportName})`;
            requireCode += ` var ${wildcardName} = ${moduleExpr};`;
          }
        } else if (exportStarNames.length > 0 && secondaryImportName !== primaryImportName) {
          requireCode += ` var ${secondaryImportName} = ${this.helperManager.getHelperName(
            "interopRequireWildcard"
          )}(${primaryImportName});`;
        } else if (defaultNames.length > 0 && secondaryImportName !== primaryImportName) {
          requireCode += ` var ${secondaryImportName} = ${this.helperManager.getHelperName(
            "interopRequireDefault"
          )}(${primaryImportName});`;
        }
        for (const { importedName, localName } of namedExports) {
          requireCode += ` ${this.helperManager.getHelperName(
            "createNamedExportFrom"
          )}(${primaryImportName}, '${localName}', '${importedName}');`;
        }
        for (const exportStarName of exportStarNames) {
          requireCode += ` exports.${exportStarName} = ${secondaryImportName};`;
        }
        if (hasStarExport) {
          requireCode += ` ${this.helperManager.getHelperName(
            "createStarExport"
          )}(${primaryImportName});`;
        }
        this.importsToReplace.set(path, requireCode);
        for (const defaultName of defaultNames) {
          this.identifierReplacements.set(defaultName, `${secondaryImportName}.default`);
        }
        for (const { importedName, localName } of namedImports) {
          this.identifierReplacements.set(localName, `${primaryImportName}.${importedName}`);
        }
      }
    }
    getFreeIdentifierForPath(path) {
      const components = path.split("/");
      const lastComponent = components[components.length - 1];
      const baseName = lastComponent.replace(/\W/g, "");
      return this.nameManager.claimFreeName(`_${baseName}`);
    }
    preprocessImportAtIndex(index) {
      const defaultNames = [];
      const wildcardNames = [];
      const namedImports = [];
      index++;
      if ((this.tokens.matchesContextualAtIndex(index, ContextualKeyword._type) || this.tokens.matches1AtIndex(index, TokenType3._typeof)) && !this.tokens.matches1AtIndex(index + 1, TokenType3.comma) && !this.tokens.matchesContextualAtIndex(index + 1, ContextualKeyword._from)) {
        return;
      }
      if (this.tokens.matches1AtIndex(index, TokenType3.parenL)) {
        return;
      }
      if (this.tokens.matches1AtIndex(index, TokenType3.name)) {
        defaultNames.push(this.tokens.identifierNameAtIndex(index));
        index++;
        if (this.tokens.matches1AtIndex(index, TokenType3.comma)) {
          index++;
        }
      }
      if (this.tokens.matches1AtIndex(index, TokenType3.star)) {
        index += 2;
        wildcardNames.push(this.tokens.identifierNameAtIndex(index));
        index++;
      }
      if (this.tokens.matches1AtIndex(index, TokenType3.braceL)) {
        const result = this.getNamedImports(index + 1);
        index = result.newIndex;
        for (const namedImport of result.namedImports) {
          if (namedImport.importedName === "default") {
            defaultNames.push(namedImport.localName);
          } else {
            namedImports.push(namedImport);
          }
        }
      }
      if (this.tokens.matchesContextualAtIndex(index, ContextualKeyword._from)) {
        index++;
      }
      if (!this.tokens.matches1AtIndex(index, TokenType3.string)) {
        throw new Error("Expected string token at the end of import statement.");
      }
      const path = this.tokens.stringValueAtIndex(index);
      const importInfo = this.getImportInfo(path);
      importInfo.defaultNames.push(...defaultNames);
      importInfo.wildcardNames.push(...wildcardNames);
      importInfo.namedImports.push(...namedImports);
      if (defaultNames.length === 0 && wildcardNames.length === 0 && namedImports.length === 0) {
        importInfo.hasBareImport = true;
      }
    }
    preprocessExportAtIndex(index) {
      if (this.tokens.matches2AtIndex(index, TokenType3._export, TokenType3._var) || this.tokens.matches2AtIndex(index, TokenType3._export, TokenType3._let) || this.tokens.matches2AtIndex(index, TokenType3._export, TokenType3._const)) {
        this.preprocessVarExportAtIndex(index);
      } else if (this.tokens.matches2AtIndex(index, TokenType3._export, TokenType3._function) || this.tokens.matches2AtIndex(index, TokenType3._export, TokenType3._class)) {
        const exportName = this.tokens.identifierNameAtIndex(index + 2);
        this.addExportBinding(exportName, exportName);
      } else if (this.tokens.matches3AtIndex(index, TokenType3._export, TokenType3.name, TokenType3._function)) {
        const exportName = this.tokens.identifierNameAtIndex(index + 3);
        this.addExportBinding(exportName, exportName);
      } else if (this.tokens.matches2AtIndex(index, TokenType3._export, TokenType3.braceL)) {
        this.preprocessNamedExportAtIndex(index);
      } else if (this.tokens.matches2AtIndex(index, TokenType3._export, TokenType3.star)) {
        this.preprocessExportStarAtIndex(index);
      }
    }
    preprocessVarExportAtIndex(index) {
      let depth = 0;
      for (let i = index + 2; ; i++) {
        if (this.tokens.matches1AtIndex(i, TokenType3.braceL) || this.tokens.matches1AtIndex(i, TokenType3.dollarBraceL) || this.tokens.matches1AtIndex(i, TokenType3.bracketL)) {
          depth++;
        } else if (this.tokens.matches1AtIndex(i, TokenType3.braceR) || this.tokens.matches1AtIndex(i, TokenType3.bracketR)) {
          depth--;
        } else if (depth === 0 && !this.tokens.matches1AtIndex(i, TokenType3.name)) {
          break;
        } else if (this.tokens.matches1AtIndex(1, TokenType3.eq)) {
          const endIndex = this.tokens.currentToken().rhsEndIndex;
          if (endIndex == null) {
            throw new Error("Expected = token with an end index.");
          }
          i = endIndex - 1;
        } else {
          const token = this.tokens.tokens[i];
          if (isDeclaration(token)) {
            const exportName = this.tokens.identifierNameAtIndex(i);
            this.identifierReplacements.set(exportName, `exports.${exportName}`);
          }
        }
      }
    }
    /**
     * Walk this export statement just in case it's an export...from statement.
     * If it is, combine it into the import info for that path. Otherwise, just
     * bail out; it'll be handled later.
     */
    preprocessNamedExportAtIndex(index) {
      index += 2;
      const { newIndex, namedImports } = this.getNamedImports(index);
      index = newIndex;
      if (this.tokens.matchesContextualAtIndex(index, ContextualKeyword._from)) {
        index++;
      } else {
        for (const { importedName: localName, localName: exportedName } of namedImports) {
          this.addExportBinding(localName, exportedName);
        }
        return;
      }
      if (!this.tokens.matches1AtIndex(index, TokenType3.string)) {
        throw new Error("Expected string token at the end of import statement.");
      }
      const path = this.tokens.stringValueAtIndex(index);
      const importInfo = this.getImportInfo(path);
      importInfo.namedExports.push(...namedImports);
    }
    preprocessExportStarAtIndex(index) {
      let exportedName = null;
      if (this.tokens.matches3AtIndex(index, TokenType3._export, TokenType3.star, TokenType3._as)) {
        index += 3;
        exportedName = this.tokens.identifierNameAtIndex(index);
        index += 2;
      } else {
        index += 3;
      }
      if (!this.tokens.matches1AtIndex(index, TokenType3.string)) {
        throw new Error("Expected string token at the end of star export statement.");
      }
      const path = this.tokens.stringValueAtIndex(index);
      const importInfo = this.getImportInfo(path);
      if (exportedName !== null) {
        importInfo.exportStarNames.push(exportedName);
      } else {
        importInfo.hasStarExport = true;
      }
    }
    getNamedImports(index) {
      const namedImports = [];
      while (true) {
        if (this.tokens.matches1AtIndex(index, TokenType3.braceR)) {
          index++;
          break;
        }
        const specifierInfo = getImportExportSpecifierInfo(this.tokens, index);
        index = specifierInfo.endIndex;
        if (!specifierInfo.isType) {
          namedImports.push({
            importedName: specifierInfo.leftName,
            localName: specifierInfo.rightName
          });
        }
        if (this.tokens.matches2AtIndex(index, TokenType3.comma, TokenType3.braceR)) {
          index += 2;
          break;
        } else if (this.tokens.matches1AtIndex(index, TokenType3.braceR)) {
          index++;
          break;
        } else if (this.tokens.matches1AtIndex(index, TokenType3.comma)) {
          index++;
        } else {
          throw new Error(`Unexpected token: ${JSON.stringify(this.tokens.tokens[index])}`);
        }
      }
      return { newIndex: index, namedImports };
    }
    /**
     * Get a mutable import info object for this path, creating one if it doesn't
     * exist yet.
     */
    getImportInfo(path) {
      const existingInfo = this.importInfoByPath.get(path);
      if (existingInfo) {
        return existingInfo;
      }
      const newInfo = {
        defaultNames: [],
        wildcardNames: [],
        namedImports: [],
        namedExports: [],
        hasBareImport: false,
        exportStarNames: [],
        hasStarExport: false
      };
      this.importInfoByPath.set(path, newInfo);
      return newInfo;
    }
    addExportBinding(localName, exportedName) {
      if (!this.exportBindingsByLocalName.has(localName)) {
        this.exportBindingsByLocalName.set(localName, []);
      }
      this.exportBindingsByLocalName.get(localName).push(exportedName);
    }
    /**
     * Return the code to use for the import for this path, or the empty string if
     * the code has already been "claimed" by a previous import.
     */
    claimImportCode(importPath) {
      const result = this.importsToReplace.get(importPath);
      this.importsToReplace.set(importPath, "");
      return result || "";
    }
    getIdentifierReplacement(identifierName) {
      return this.identifierReplacements.get(identifierName) || null;
    }
    /**
     * Return a string like `exports.foo = exports.bar`.
     */
    resolveExportBinding(assignedName) {
      const exportedNames = this.exportBindingsByLocalName.get(assignedName);
      if (!exportedNames || exportedNames.length === 0) {
        return null;
      }
      return exportedNames.map((exportedName) => `exports.${exportedName}`).join(" = ");
    }
    /**
     * Return all imported/exported names where we might be interested in whether usages of those
     * names are shadowed.
     */
    getGlobalNames() {
      return /* @__PURE__ */ new Set([
        ...this.identifierReplacements.keys(),
        ...this.exportBindingsByLocalName.keys()
      ]);
    }
  };

  // node_modules/@jridgewell/sourcemap-codec/dist/sourcemap-codec.mjs
  var comma = ",".charCodeAt(0);
  var semicolon2 = ";".charCodeAt(0);
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var intToChar = new Uint8Array(64);
  var charToInt = new Uint8Array(128);
  for (let i = 0; i < chars.length; i++) {
    const c = chars.charCodeAt(i);
    intToChar[i] = c;
    charToInt[c] = i;
  }
  function encodeInteger(builder, num) {
    do {
      let clamped = num & 31;
      num >>>= 5;
      if (num > 0) clamped |= 32;
      builder.write(intToChar[clamped]);
    } while (num > 0);
  }
  function encodeSign(num) {
    return num < 0 ? -num << 1 | 1 : num << 1;
  }
  var bufLength = 1024 * 16;
  var td = typeof TextDecoder !== "undefined" ? /* @__PURE__ */ new TextDecoder() : typeof Buffer !== "undefined" ? {
    decode(buf) {
      const out = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
      return out.toString();
    }
  } : {
    decode(buf) {
      let out = "";
      for (let i = 0; i < buf.length; i++) {
        out += String.fromCharCode(buf[i]);
      }
      return out;
    }
  };
  var StringWriter = class {
    constructor() {
      this.pos = 0;
      this.out = "";
      this.buffer = new Uint8Array(bufLength);
    }
    write(v) {
      const { buffer } = this;
      buffer[this.pos++] = v;
      if (this.pos === bufLength) {
        this.out += td.decode(buffer);
        this.pos = 0;
      }
    }
    flush() {
      const { buffer, out, pos } = this;
      return pos > 0 ? out + td.decode(buffer.subarray(0, pos)) : out;
    }
  };
  function encode(decoded) {
    const writer = new StringWriter();
    let sourcesIndex = 0;
    let sourceLine = 0;
    let sourceColumn = 0;
    let namesIndex = 0;
    for (let i = 0; i < decoded.length; i++) {
      const line = decoded[i];
      if (i > 0) writer.write(semicolon2);
      if (line.length === 0) continue;
      let genColumn = 0;
      for (let j = 0; j < line.length; j++) {
        const segment = line[j];
        if (j > 0) writer.write(comma);
        encodeInteger(writer, encodeSign(segment[0] - genColumn));
        genColumn = segment[0];
        if (segment.length === 1) continue;
        encodeInteger(writer, encodeSign(segment[1] - sourcesIndex));
        encodeInteger(writer, encodeSign(segment[2] - sourceLine));
        encodeInteger(writer, encodeSign(segment[3] - sourceColumn));
        sourcesIndex = segment[1];
        sourceLine = segment[2];
        sourceColumn = segment[3];
        if (segment.length === 4) continue;
        encodeInteger(writer, encodeSign(segment[4] - namesIndex));
        namesIndex = segment[4];
      }
    }
    return writer.flush();
  }

  // node_modules/@jridgewell/gen-mapping/dist/gen-mapping.mjs
  var SetArray = class {
    constructor() {
      this._indexes = { __proto__: null };
      this.array = [];
    }
  };
  function cast(set) {
    return set;
  }
  function get(setarr, key) {
    return cast(setarr)._indexes[key];
  }
  function put(setarr, key) {
    const index = get(setarr, key);
    if (index !== void 0) return index;
    const { array: array2, _indexes: indexes } = cast(setarr);
    const length = array2.push(key);
    return indexes[key] = length - 1;
  }
  var COLUMN = 0;
  var SOURCES_INDEX = 1;
  var SOURCE_LINE = 2;
  var SOURCE_COLUMN = 3;
  var NAMES_INDEX = 4;
  var NO_NAME = -1;
  var GenMapping = class {
    constructor({ file, sourceRoot } = {}) {
      this._names = new SetArray();
      this._sources = new SetArray();
      this._sourcesContent = [];
      this._mappings = [];
      this.file = file;
      this.sourceRoot = sourceRoot;
      this._ignoreList = new SetArray();
    }
  };
  function cast2(map) {
    return map;
  }
  var maybeAddSegment = (map, genLine, genColumn, source, sourceLine, sourceColumn, name, content) => {
    return addSegmentInternal(
      true,
      map,
      genLine,
      genColumn,
      source,
      sourceLine,
      sourceColumn,
      name,
      content
    );
  };
  function toDecodedMap(map) {
    const {
      _mappings: mappings,
      _sources: sources,
      _sourcesContent: sourcesContent,
      _names: names,
      _ignoreList: ignoreList
      // _originalScopes: originalScopes,
      // _generatedRanges: generatedRanges,
    } = cast2(map);
    removeEmptyFinalLines(mappings);
    return {
      version: 3,
      file: map.file || void 0,
      names: names.array,
      sourceRoot: map.sourceRoot || void 0,
      sources: sources.array,
      sourcesContent,
      mappings,
      // originalScopes,
      // generatedRanges,
      ignoreList: ignoreList.array
    };
  }
  function toEncodedMap(map) {
    const decoded = toDecodedMap(map);
    return Object.assign({}, decoded, {
      // originalScopes: decoded.originalScopes.map((os) => encodeOriginalScopes(os)),
      // generatedRanges: encodeGeneratedRanges(decoded.generatedRanges as GeneratedRange[]),
      mappings: encode(decoded.mappings)
    });
  }
  function addSegmentInternal(skipable, map, genLine, genColumn, source, sourceLine, sourceColumn, name, content) {
    const {
      _mappings: mappings,
      _sources: sources,
      _sourcesContent: sourcesContent,
      _names: names
      // _originalScopes: originalScopes,
    } = cast2(map);
    const line = getIndex(mappings, genLine);
    const index = getColumnIndex(line, genColumn);
    if (!source) {
      if (skipable && skipSourceless(line, index)) return;
      return insert(line, index, [genColumn]);
    }
    assert(sourceLine);
    assert(sourceColumn);
    const sourcesIndex = put(sources, source);
    const namesIndex = name ? put(names, name) : NO_NAME;
    if (sourcesIndex === sourcesContent.length) sourcesContent[sourcesIndex] = content != null ? content : null;
    if (skipable && skipSource(line, index, sourcesIndex, sourceLine, sourceColumn, namesIndex)) {
      return;
    }
    return insert(
      line,
      index,
      name ? [genColumn, sourcesIndex, sourceLine, sourceColumn, namesIndex] : [genColumn, sourcesIndex, sourceLine, sourceColumn]
    );
  }
  function assert(_val) {
  }
  function getIndex(arr, index) {
    for (let i = arr.length; i <= index; i++) {
      arr[i] = [];
    }
    return arr[index];
  }
  function getColumnIndex(line, genColumn) {
    let index = line.length;
    for (let i = index - 1; i >= 0; index = i--) {
      const current2 = line[i];
      if (genColumn >= current2[COLUMN]) break;
    }
    return index;
  }
  function insert(array2, index, value) {
    for (let i = array2.length; i > index; i--) {
      array2[i] = array2[i - 1];
    }
    array2[index] = value;
  }
  function removeEmptyFinalLines(mappings) {
    const { length } = mappings;
    let len = length;
    for (let i = len - 1; i >= 0; len = i, i--) {
      if (mappings[i].length > 0) break;
    }
    if (len < length) mappings.length = len;
  }
  function skipSourceless(line, index) {
    if (index === 0) return true;
    const prev = line[index - 1];
    return prev.length === 1;
  }
  function skipSource(line, index, sourcesIndex, sourceLine, sourceColumn, namesIndex) {
    if (index === 0) return false;
    const prev = line[index - 1];
    if (prev.length === 1) return false;
    return sourcesIndex === prev[SOURCES_INDEX] && sourceLine === prev[SOURCE_LINE] && sourceColumn === prev[SOURCE_COLUMN] && namesIndex === (prev.length === 5 ? prev[NAMES_INDEX] : NO_NAME);
  }

  // node_modules/sucrase/dist/esm/computeSourceMap.js
  function computeSourceMap({ code: generatedCode, mappings: rawMappings }, filePath, options, source, tokens) {
    const sourceColumns = computeSourceColumns(source, tokens);
    const map = new GenMapping({ file: options.compiledFilename });
    let tokenIndex = 0;
    let currentMapping = rawMappings[0];
    while (currentMapping === void 0 && tokenIndex < rawMappings.length - 1) {
      tokenIndex++;
      currentMapping = rawMappings[tokenIndex];
    }
    let line = 0;
    let lineStart = 0;
    if (currentMapping !== lineStart) {
      maybeAddSegment(map, line, 0, filePath, line, 0);
    }
    for (let i = 0; i < generatedCode.length; i++) {
      if (i === currentMapping) {
        const genColumn = currentMapping - lineStart;
        const sourceColumn = sourceColumns[tokenIndex];
        maybeAddSegment(map, line, genColumn, filePath, line, sourceColumn);
        while ((currentMapping === i || currentMapping === void 0) && tokenIndex < rawMappings.length - 1) {
          tokenIndex++;
          currentMapping = rawMappings[tokenIndex];
        }
      }
      if (generatedCode.charCodeAt(i) === charCodes.lineFeed) {
        line++;
        lineStart = i + 1;
        if (currentMapping !== lineStart) {
          maybeAddSegment(map, line, 0, filePath, line, 0);
        }
      }
    }
    const { sourceRoot, sourcesContent, ...sourceMap } = toEncodedMap(map);
    return sourceMap;
  }
  function computeSourceColumns(code, tokens) {
    const sourceColumns = new Array(tokens.length);
    let tokenIndex = 0;
    let currentMapping = tokens[tokenIndex].start;
    let lineStart = 0;
    for (let i = 0; i < code.length; i++) {
      if (i === currentMapping) {
        sourceColumns[tokenIndex] = currentMapping - lineStart;
        tokenIndex++;
        currentMapping = tokens[tokenIndex].start;
      }
      if (code.charCodeAt(i) === charCodes.lineFeed) {
        lineStart = i + 1;
      }
    }
    return sourceColumns;
  }

  // node_modules/sucrase/dist/esm/HelperManager.js
  var HELPERS = {
    require: `
    import {createRequire as CREATE_REQUIRE_NAME} from "module";
    const require = CREATE_REQUIRE_NAME(import.meta.url);
  `,
    interopRequireWildcard: `
    function interopRequireWildcard(obj) {
      if (obj && obj.__esModule) {
        return obj;
      } else {
        var newObj = {};
        if (obj != null) {
          for (var key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
              newObj[key] = obj[key];
            }
          }
        }
        newObj.default = obj;
        return newObj;
      }
    }
  `,
    interopRequireDefault: `
    function interopRequireDefault(obj) {
      return obj && obj.__esModule ? obj : { default: obj };
    }
  `,
    createNamedExportFrom: `
    function createNamedExportFrom(obj, localName, importedName) {
      Object.defineProperty(exports, localName, {enumerable: true, configurable: true, get: () => obj[importedName]});
    }
  `,
    // Note that TypeScript and Babel do this differently; TypeScript does a simple existence
    // check in the exports object and does a plain assignment, whereas Babel uses
    // defineProperty and builds an object of explicitly-exported names so that star exports can
    // always take lower precedence. For now, we do the easier TypeScript thing.
    createStarExport: `
    function createStarExport(obj) {
      Object.keys(obj)
        .filter((key) => key !== "default" && key !== "__esModule")
        .forEach((key) => {
          if (exports.hasOwnProperty(key)) {
            return;
          }
          Object.defineProperty(exports, key, {enumerable: true, configurable: true, get: () => obj[key]});
        });
    }
  `,
    nullishCoalesce: `
    function nullishCoalesce(lhs, rhsFn) {
      if (lhs != null) {
        return lhs;
      } else {
        return rhsFn();
      }
    }
  `,
    asyncNullishCoalesce: `
    async function asyncNullishCoalesce(lhs, rhsFn) {
      if (lhs != null) {
        return lhs;
      } else {
        return await rhsFn();
      }
    }
  `,
    optionalChain: `
    function optionalChain(ops) {
      let lastAccessLHS = undefined;
      let value = ops[0];
      let i = 1;
      while (i < ops.length) {
        const op = ops[i];
        const fn = ops[i + 1];
        i += 2;
        if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) {
          return undefined;
        }
        if (op === 'access' || op === 'optionalAccess') {
          lastAccessLHS = value;
          value = fn(value);
        } else if (op === 'call' || op === 'optionalCall') {
          value = fn((...args) => value.call(lastAccessLHS, ...args));
          lastAccessLHS = undefined;
        }
      }
      return value;
    }
  `,
    asyncOptionalChain: `
    async function asyncOptionalChain(ops) {
      let lastAccessLHS = undefined;
      let value = ops[0];
      let i = 1;
      while (i < ops.length) {
        const op = ops[i];
        const fn = ops[i + 1];
        i += 2;
        if ((op === 'optionalAccess' || op === 'optionalCall') && value == null) {
          return undefined;
        }
        if (op === 'access' || op === 'optionalAccess') {
          lastAccessLHS = value;
          value = await fn(value);
        } else if (op === 'call' || op === 'optionalCall') {
          value = await fn((...args) => value.call(lastAccessLHS, ...args));
          lastAccessLHS = undefined;
        }
      }
      return value;
    }
  `,
    optionalChainDelete: `
    function optionalChainDelete(ops) {
      const result = OPTIONAL_CHAIN_NAME(ops);
      return result == null ? true : result;
    }
  `,
    asyncOptionalChainDelete: `
    async function asyncOptionalChainDelete(ops) {
      const result = await ASYNC_OPTIONAL_CHAIN_NAME(ops);
      return result == null ? true : result;
    }
  `
  };
  var HelperManager = class _HelperManager {
    __init() {
      this.helperNames = {};
    }
    __init2() {
      this.createRequireName = null;
    }
    constructor(nameManager) {
      ;
      this.nameManager = nameManager;
      _HelperManager.prototype.__init.call(this);
      _HelperManager.prototype.__init2.call(this);
    }
    getHelperName(baseName) {
      let helperName = this.helperNames[baseName];
      if (helperName) {
        return helperName;
      }
      helperName = this.nameManager.claimFreeName(`_${baseName}`);
      this.helperNames[baseName] = helperName;
      return helperName;
    }
    emitHelpers() {
      let resultCode = "";
      if (this.helperNames.optionalChainDelete) {
        this.getHelperName("optionalChain");
      }
      if (this.helperNames.asyncOptionalChainDelete) {
        this.getHelperName("asyncOptionalChain");
      }
      for (const [baseName, helperCodeTemplate] of Object.entries(HELPERS)) {
        const helperName = this.helperNames[baseName];
        let helperCode = helperCodeTemplate;
        if (baseName === "optionalChainDelete") {
          helperCode = helperCode.replace("OPTIONAL_CHAIN_NAME", this.helperNames.optionalChain);
        } else if (baseName === "asyncOptionalChainDelete") {
          helperCode = helperCode.replace(
            "ASYNC_OPTIONAL_CHAIN_NAME",
            this.helperNames.asyncOptionalChain
          );
        } else if (baseName === "require") {
          if (this.createRequireName === null) {
            this.createRequireName = this.nameManager.claimFreeName("_createRequire");
          }
          helperCode = helperCode.replace(/CREATE_REQUIRE_NAME/g, this.createRequireName);
        }
        if (helperName) {
          resultCode += " ";
          resultCode += helperCode.replace(baseName, helperName).replace(/\s+/g, " ").trim();
        }
      }
      return resultCode;
    }
  };

  // node_modules/sucrase/dist/esm/identifyShadowedGlobals.js
  function identifyShadowedGlobals(tokens, scopes, globalNames) {
    if (!hasShadowedGlobals(tokens, globalNames)) {
      return;
    }
    markShadowedGlobals(tokens, scopes, globalNames);
  }
  function hasShadowedGlobals(tokens, globalNames) {
    for (const token of tokens.tokens) {
      if (token.type === TokenType3.name && !token.isType && isNonTopLevelDeclaration(token) && globalNames.has(tokens.identifierNameForToken(token))) {
        return true;
      }
    }
    return false;
  }
  function markShadowedGlobals(tokens, scopes, globalNames) {
    const scopeStack = [];
    let scopeIndex = scopes.length - 1;
    for (let i = tokens.tokens.length - 1; ; i--) {
      while (scopeStack.length > 0 && scopeStack[scopeStack.length - 1].startTokenIndex === i + 1) {
        scopeStack.pop();
      }
      while (scopeIndex >= 0 && scopes[scopeIndex].endTokenIndex === i + 1) {
        scopeStack.push(scopes[scopeIndex]);
        scopeIndex--;
      }
      if (i < 0) {
        break;
      }
      const token = tokens.tokens[i];
      const name = tokens.identifierNameForToken(token);
      if (scopeStack.length > 1 && !token.isType && token.type === TokenType3.name && globalNames.has(name)) {
        if (isBlockScopedDeclaration(token)) {
          markShadowedForScope(scopeStack[scopeStack.length - 1], tokens, name);
        } else if (isFunctionScopedDeclaration(token)) {
          let stackIndex = scopeStack.length - 1;
          while (stackIndex > 0 && !scopeStack[stackIndex].isFunctionScope) {
            stackIndex--;
          }
          if (stackIndex < 0) {
            throw new Error("Did not find parent function scope.");
          }
          markShadowedForScope(scopeStack[stackIndex], tokens, name);
        }
      }
    }
    if (scopeStack.length > 0) {
      throw new Error("Expected empty scope stack after processing file.");
    }
  }
  function markShadowedForScope(scope, tokens, name) {
    for (let i = scope.startTokenIndex; i < scope.endTokenIndex; i++) {
      const token = tokens.tokens[i];
      if ((token.type === TokenType3.name || token.type === TokenType3.jsxName) && tokens.identifierNameForToken(token) === name) {
        token.shadowsGlobal = true;
      }
    }
  }

  // node_modules/sucrase/dist/esm/util/getIdentifierNames.js
  function getIdentifierNames(code, tokens) {
    const names = [];
    for (const token of tokens) {
      if (token.type === TokenType3.name) {
        names.push(code.slice(token.start, token.end));
      }
    }
    return names;
  }

  // node_modules/sucrase/dist/esm/NameManager.js
  var NameManager = class _NameManager {
    __init() {
      this.usedNames = /* @__PURE__ */ new Set();
    }
    constructor(code, tokens) {
      ;
      _NameManager.prototype.__init.call(this);
      this.usedNames = new Set(getIdentifierNames(code, tokens));
    }
    claimFreeName(name) {
      const newName = this.findFreeName(name);
      this.usedNames.add(newName);
      return newName;
    }
    findFreeName(name) {
      if (!this.usedNames.has(name)) {
        return name;
      }
      let suffixNum = 2;
      while (this.usedNames.has(name + String(suffixNum))) {
        suffixNum++;
      }
      return name + String(suffixNum);
    }
  };

  // node_modules/sucrase/dist/esm/Options.js
  var import_ts_interface_checker = __toESM(require_dist());

  // node_modules/sucrase/dist/esm/Options-gen-types.js
  var t = __toESM(require_dist());
  var Transform = t.union(
    t.lit("jsx"),
    t.lit("typescript"),
    t.lit("flow"),
    t.lit("imports"),
    t.lit("react-hot-loader"),
    t.lit("jest")
  );
  var SourceMapOptions = t.iface([], {
    compiledFilename: "string"
  });
  var Options = t.iface([], {
    transforms: t.array("Transform"),
    disableESTransforms: t.opt("boolean"),
    jsxRuntime: t.opt(t.union(t.lit("classic"), t.lit("automatic"), t.lit("preserve"))),
    production: t.opt("boolean"),
    jsxImportSource: t.opt("string"),
    jsxPragma: t.opt("string"),
    jsxFragmentPragma: t.opt("string"),
    keepUnusedImports: t.opt("boolean"),
    preserveDynamicImport: t.opt("boolean"),
    injectCreateRequireForImportRequire: t.opt("boolean"),
    enableLegacyTypeScriptModuleInterop: t.opt("boolean"),
    enableLegacyBabel5ModuleInterop: t.opt("boolean"),
    sourceMapOptions: t.opt("SourceMapOptions"),
    filePath: t.opt("string")
  });
  var exportedTypeSuite = {
    Transform,
    SourceMapOptions,
    Options
  };
  var Options_gen_types_default = exportedTypeSuite;

  // node_modules/sucrase/dist/esm/Options.js
  var { Options: OptionsChecker } = (0, import_ts_interface_checker.createCheckers)(Options_gen_types_default);
  function validateOptions(options) {
    OptionsChecker.strictCheck(options);
  }

  // node_modules/sucrase/dist/esm/parser/traverser/lval.js
  function parseSpread() {
    next();
    parseMaybeAssign(false);
  }
  function parseRest(isBlockScope) {
    next();
    parseBindingAtom(isBlockScope);
  }
  function parseBindingIdentifier(isBlockScope) {
    parseIdentifier();
    markPriorBindingIdentifier(isBlockScope);
  }
  function parseImportedIdentifier() {
    parseIdentifier();
    state.tokens[state.tokens.length - 1].identifierRole = IdentifierRole.ImportDeclaration;
  }
  function markPriorBindingIdentifier(isBlockScope) {
    let identifierRole;
    if (state.scopeDepth === 0) {
      identifierRole = IdentifierRole.TopLevelDeclaration;
    } else if (isBlockScope) {
      identifierRole = IdentifierRole.BlockScopedDeclaration;
    } else {
      identifierRole = IdentifierRole.FunctionScopedDeclaration;
    }
    state.tokens[state.tokens.length - 1].identifierRole = identifierRole;
  }
  function parseBindingAtom(isBlockScope) {
    switch (state.type) {
      case TokenType3._this: {
        const oldIsType = pushTypeContext(0);
        next();
        popTypeContext(oldIsType);
        return;
      }
      case TokenType3._yield:
      case TokenType3.name: {
        state.type = TokenType3.name;
        parseBindingIdentifier(isBlockScope);
        return;
      }
      case TokenType3.bracketL: {
        next();
        parseBindingList(
          TokenType3.bracketR,
          isBlockScope,
          true
          /* allowEmpty */
        );
        return;
      }
      case TokenType3.braceL:
        parseObj(true, isBlockScope);
        return;
      default:
        unexpected();
    }
  }
  function parseBindingList(close, isBlockScope, allowEmpty = false, allowModifiers = false, contextId = 0) {
    let first = true;
    let hasRemovedComma = false;
    const firstItemTokenIndex = state.tokens.length;
    while (!eat2(close) && !state.error) {
      if (first) {
        first = false;
      } else {
        expect(TokenType3.comma);
        state.tokens[state.tokens.length - 1].contextId = contextId;
        if (!hasRemovedComma && state.tokens[firstItemTokenIndex].isType) {
          state.tokens[state.tokens.length - 1].isType = true;
          hasRemovedComma = true;
        }
      }
      if (allowEmpty && match(TokenType3.comma)) {
      } else if (eat2(close)) {
        break;
      } else if (match(TokenType3.ellipsis)) {
        parseRest(isBlockScope);
        parseAssignableListItemTypes();
        eat2(TokenType3.comma);
        expect(close);
        break;
      } else {
        parseAssignableListItem(allowModifiers, isBlockScope);
      }
    }
  }
  function parseAssignableListItem(allowModifiers, isBlockScope) {
    if (allowModifiers) {
      tsParseModifiers([
        ContextualKeyword._public,
        ContextualKeyword._protected,
        ContextualKeyword._private,
        ContextualKeyword._readonly,
        ContextualKeyword._override
      ]);
    }
    parseMaybeDefault(isBlockScope);
    parseAssignableListItemTypes();
    parseMaybeDefault(
      isBlockScope,
      true
      /* leftAlreadyParsed */
    );
  }
  function parseAssignableListItemTypes() {
    if (isFlowEnabled) {
      flowParseAssignableListItemTypes();
    } else if (isTypeScriptEnabled) {
      tsParseAssignableListItemTypes();
    }
  }
  function parseMaybeDefault(isBlockScope, leftAlreadyParsed = false) {
    if (!leftAlreadyParsed) {
      parseBindingAtom(isBlockScope);
    }
    if (!eat2(TokenType3.eq)) {
      return;
    }
    const eqIndex = state.tokens.length - 1;
    parseMaybeAssign();
    state.tokens[eqIndex].rhsEndIndex = state.tokens.length;
  }

  // node_modules/sucrase/dist/esm/parser/plugins/typescript.js
  function tsIsIdentifier() {
    return match(TokenType3.name);
  }
  function isLiteralPropertyName() {
    return match(TokenType3.name) || Boolean(state.type & TokenType3.IS_KEYWORD) || match(TokenType3.string) || match(TokenType3.num) || match(TokenType3.bigint) || match(TokenType3.decimal);
  }
  function tsNextTokenCanFollowModifier() {
    const snapshot = state.snapshot();
    next();
    const canFollowModifier = (match(TokenType3.bracketL) || match(TokenType3.braceL) || match(TokenType3.star) || match(TokenType3.ellipsis) || match(TokenType3.hash) || isLiteralPropertyName()) && !hasPrecedingLineBreak();
    if (canFollowModifier) {
      return true;
    } else {
      state.restoreFromSnapshot(snapshot);
      return false;
    }
  }
  function tsParseModifiers(allowedModifiers) {
    while (true) {
      const modifier = tsParseModifier(allowedModifiers);
      if (modifier === null) {
        break;
      }
    }
  }
  function tsParseModifier(allowedModifiers) {
    if (!match(TokenType3.name)) {
      return null;
    }
    const modifier = state.contextualKeyword;
    if (allowedModifiers.indexOf(modifier) !== -1 && tsNextTokenCanFollowModifier()) {
      switch (modifier) {
        case ContextualKeyword._readonly:
          state.tokens[state.tokens.length - 1].type = TokenType3._readonly;
          break;
        case ContextualKeyword._abstract:
          state.tokens[state.tokens.length - 1].type = TokenType3._abstract;
          break;
        case ContextualKeyword._static:
          state.tokens[state.tokens.length - 1].type = TokenType3._static;
          break;
        case ContextualKeyword._public:
          state.tokens[state.tokens.length - 1].type = TokenType3._public;
          break;
        case ContextualKeyword._private:
          state.tokens[state.tokens.length - 1].type = TokenType3._private;
          break;
        case ContextualKeyword._protected:
          state.tokens[state.tokens.length - 1].type = TokenType3._protected;
          break;
        case ContextualKeyword._override:
          state.tokens[state.tokens.length - 1].type = TokenType3._override;
          break;
        case ContextualKeyword._declare:
          state.tokens[state.tokens.length - 1].type = TokenType3._declare;
          break;
        default:
          break;
      }
      return modifier;
    }
    return null;
  }
  function tsParseEntityName() {
    parseIdentifier();
    while (eat2(TokenType3.dot)) {
      parseIdentifier();
    }
  }
  function tsParseTypeReference() {
    tsParseEntityName();
    if (!hasPrecedingLineBreak() && match(TokenType3.lessThan)) {
      tsParseTypeArguments();
    }
  }
  function tsParseThisTypePredicate() {
    next();
    tsParseTypeAnnotation();
  }
  function tsParseThisTypeNode() {
    next();
  }
  function tsParseTypeQuery() {
    expect(TokenType3._typeof);
    if (match(TokenType3._import)) {
      tsParseImportType();
    } else {
      tsParseEntityName();
    }
    if (!hasPrecedingLineBreak() && match(TokenType3.lessThan)) {
      tsParseTypeArguments();
    }
  }
  function tsParseImportType() {
    expect(TokenType3._import);
    expect(TokenType3.parenL);
    expect(TokenType3.string);
    expect(TokenType3.parenR);
    if (eat2(TokenType3.dot)) {
      tsParseEntityName();
    }
    if (match(TokenType3.lessThan)) {
      tsParseTypeArguments();
    }
  }
  function tsParseTypeParameter() {
    eat2(TokenType3._const);
    const hadIn = eat2(TokenType3._in);
    const hadOut = eatContextual(ContextualKeyword._out);
    eat2(TokenType3._const);
    if ((hadIn || hadOut) && !match(TokenType3.name)) {
      state.tokens[state.tokens.length - 1].type = TokenType3.name;
    } else {
      parseIdentifier();
    }
    if (eat2(TokenType3._extends)) {
      tsParseType();
    }
    if (eat2(TokenType3.eq)) {
      tsParseType();
    }
  }
  function tsTryParseTypeParameters() {
    if (match(TokenType3.lessThan)) {
      tsParseTypeParameters();
    }
  }
  function tsParseTypeParameters() {
    const oldIsType = pushTypeContext(0);
    if (match(TokenType3.lessThan) || match(TokenType3.typeParameterStart)) {
      next();
    } else {
      unexpected();
    }
    while (!eat2(TokenType3.greaterThan) && !state.error) {
      tsParseTypeParameter();
      eat2(TokenType3.comma);
    }
    popTypeContext(oldIsType);
  }
  function tsFillSignature(returnToken) {
    const returnTokenRequired = returnToken === TokenType3.arrow;
    tsTryParseTypeParameters();
    expect(TokenType3.parenL);
    state.scopeDepth++;
    tsParseBindingListForSignature(
      false
      /* isBlockScope */
    );
    state.scopeDepth--;
    if (returnTokenRequired) {
      tsParseTypeOrTypePredicateAnnotation(returnToken);
    } else if (match(returnToken)) {
      tsParseTypeOrTypePredicateAnnotation(returnToken);
    }
  }
  function tsParseBindingListForSignature(isBlockScope) {
    parseBindingList(TokenType3.parenR, isBlockScope);
  }
  function tsParseTypeMemberSemicolon() {
    if (!eat2(TokenType3.comma)) {
      semicolon();
    }
  }
  function tsParseSignatureMember() {
    tsFillSignature(TokenType3.colon);
    tsParseTypeMemberSemicolon();
  }
  function tsIsUnambiguouslyIndexSignature() {
    const snapshot = state.snapshot();
    next();
    const isIndexSignature = eat2(TokenType3.name) && match(TokenType3.colon);
    state.restoreFromSnapshot(snapshot);
    return isIndexSignature;
  }
  function tsTryParseIndexSignature() {
    if (!(match(TokenType3.bracketL) && tsIsUnambiguouslyIndexSignature())) {
      return false;
    }
    const oldIsType = pushTypeContext(0);
    expect(TokenType3.bracketL);
    parseIdentifier();
    tsParseTypeAnnotation();
    expect(TokenType3.bracketR);
    tsTryParseTypeAnnotation();
    tsParseTypeMemberSemicolon();
    popTypeContext(oldIsType);
    return true;
  }
  function tsParsePropertyOrMethodSignature(isReadonly) {
    eat2(TokenType3.question);
    if (!isReadonly && (match(TokenType3.parenL) || match(TokenType3.lessThan))) {
      tsFillSignature(TokenType3.colon);
      tsParseTypeMemberSemicolon();
    } else {
      tsTryParseTypeAnnotation();
      tsParseTypeMemberSemicolon();
    }
  }
  function tsParseTypeMember() {
    if (match(TokenType3.parenL) || match(TokenType3.lessThan)) {
      tsParseSignatureMember();
      return;
    }
    if (match(TokenType3._new)) {
      next();
      if (match(TokenType3.parenL) || match(TokenType3.lessThan)) {
        tsParseSignatureMember();
      } else {
        tsParsePropertyOrMethodSignature(false);
      }
      return;
    }
    const readonly = !!tsParseModifier([ContextualKeyword._readonly]);
    const found = tsTryParseIndexSignature();
    if (found) {
      return;
    }
    if ((isContextual(ContextualKeyword._get) || isContextual(ContextualKeyword._set)) && tsNextTokenCanFollowModifier()) {
    }
    parsePropertyName(
      -1
      /* Types don't need context IDs. */
    );
    tsParsePropertyOrMethodSignature(readonly);
  }
  function tsParseTypeLiteral() {
    tsParseObjectTypeMembers();
  }
  function tsParseObjectTypeMembers() {
    expect(TokenType3.braceL);
    while (!eat2(TokenType3.braceR) && !state.error) {
      tsParseTypeMember();
    }
  }
  function tsLookaheadIsStartOfMappedType() {
    const snapshot = state.snapshot();
    const isStartOfMappedType = tsIsStartOfMappedType();
    state.restoreFromSnapshot(snapshot);
    return isStartOfMappedType;
  }
  function tsIsStartOfMappedType() {
    next();
    if (eat2(TokenType3.plus) || eat2(TokenType3.minus)) {
      return isContextual(ContextualKeyword._readonly);
    }
    if (isContextual(ContextualKeyword._readonly)) {
      next();
    }
    if (!match(TokenType3.bracketL)) {
      return false;
    }
    next();
    if (!tsIsIdentifier()) {
      return false;
    }
    next();
    return match(TokenType3._in);
  }
  function tsParseMappedTypeParameter() {
    parseIdentifier();
    expect(TokenType3._in);
    tsParseType();
  }
  function tsParseMappedType() {
    expect(TokenType3.braceL);
    if (match(TokenType3.plus) || match(TokenType3.minus)) {
      next();
      expectContextual(ContextualKeyword._readonly);
    } else {
      eatContextual(ContextualKeyword._readonly);
    }
    expect(TokenType3.bracketL);
    tsParseMappedTypeParameter();
    if (eatContextual(ContextualKeyword._as)) {
      tsParseType();
    }
    expect(TokenType3.bracketR);
    if (match(TokenType3.plus) || match(TokenType3.minus)) {
      next();
      expect(TokenType3.question);
    } else {
      eat2(TokenType3.question);
    }
    tsTryParseType();
    semicolon();
    expect(TokenType3.braceR);
  }
  function tsParseTupleType() {
    expect(TokenType3.bracketL);
    while (!eat2(TokenType3.bracketR) && !state.error) {
      tsParseTupleElementType();
      eat2(TokenType3.comma);
    }
  }
  function tsParseTupleElementType() {
    if (eat2(TokenType3.ellipsis)) {
      tsParseType();
    } else {
      tsParseType();
      eat2(TokenType3.question);
    }
    if (eat2(TokenType3.colon)) {
      tsParseType();
    }
  }
  function tsParseParenthesizedType() {
    expect(TokenType3.parenL);
    tsParseType();
    expect(TokenType3.parenR);
  }
  function tsParseTemplateLiteralType() {
    nextTemplateToken();
    nextTemplateToken();
    while (!match(TokenType3.backQuote) && !state.error) {
      expect(TokenType3.dollarBraceL);
      tsParseType();
      nextTemplateToken();
      nextTemplateToken();
    }
    next();
  }
  var FunctionType;
  (function(FunctionType2) {
    const TSFunctionType = 0;
    FunctionType2[FunctionType2["TSFunctionType"] = TSFunctionType] = "TSFunctionType";
    const TSConstructorType = TSFunctionType + 1;
    FunctionType2[FunctionType2["TSConstructorType"] = TSConstructorType] = "TSConstructorType";
    const TSAbstractConstructorType = TSConstructorType + 1;
    FunctionType2[FunctionType2["TSAbstractConstructorType"] = TSAbstractConstructorType] = "TSAbstractConstructorType";
  })(FunctionType || (FunctionType = {}));
  function tsParseFunctionOrConstructorType(type) {
    if (type === FunctionType.TSAbstractConstructorType) {
      expectContextual(ContextualKeyword._abstract);
    }
    if (type === FunctionType.TSConstructorType || type === FunctionType.TSAbstractConstructorType) {
      expect(TokenType3._new);
    }
    const oldInDisallowConditionalTypesContext = state.inDisallowConditionalTypesContext;
    state.inDisallowConditionalTypesContext = false;
    tsFillSignature(TokenType3.arrow);
    state.inDisallowConditionalTypesContext = oldInDisallowConditionalTypesContext;
  }
  function tsParseNonArrayType() {
    switch (state.type) {
      case TokenType3.name:
        tsParseTypeReference();
        return;
      case TokenType3._void:
      case TokenType3._null:
        next();
        return;
      case TokenType3.string:
      case TokenType3.num:
      case TokenType3.bigint:
      case TokenType3.decimal:
      case TokenType3._true:
      case TokenType3._false:
        parseLiteral();
        return;
      case TokenType3.minus:
        next();
        parseLiteral();
        return;
      case TokenType3._this: {
        tsParseThisTypeNode();
        if (isContextual(ContextualKeyword._is) && !hasPrecedingLineBreak()) {
          tsParseThisTypePredicate();
        }
        return;
      }
      case TokenType3._typeof:
        tsParseTypeQuery();
        return;
      case TokenType3._import:
        tsParseImportType();
        return;
      case TokenType3.braceL:
        if (tsLookaheadIsStartOfMappedType()) {
          tsParseMappedType();
        } else {
          tsParseTypeLiteral();
        }
        return;
      case TokenType3.bracketL:
        tsParseTupleType();
        return;
      case TokenType3.parenL:
        tsParseParenthesizedType();
        return;
      case TokenType3.backQuote:
        tsParseTemplateLiteralType();
        return;
      default:
        if (state.type & TokenType3.IS_KEYWORD) {
          next();
          state.tokens[state.tokens.length - 1].type = TokenType3.name;
          return;
        }
        break;
    }
    unexpected();
  }
  function tsParseArrayTypeOrHigher() {
    tsParseNonArrayType();
    while (!hasPrecedingLineBreak() && eat2(TokenType3.bracketL)) {
      if (!eat2(TokenType3.bracketR)) {
        tsParseType();
        expect(TokenType3.bracketR);
      }
    }
  }
  function tsParseInferType() {
    expectContextual(ContextualKeyword._infer);
    parseIdentifier();
    if (match(TokenType3._extends)) {
      const snapshot = state.snapshot();
      expect(TokenType3._extends);
      const oldInDisallowConditionalTypesContext = state.inDisallowConditionalTypesContext;
      state.inDisallowConditionalTypesContext = true;
      tsParseType();
      state.inDisallowConditionalTypesContext = oldInDisallowConditionalTypesContext;
      if (state.error || !state.inDisallowConditionalTypesContext && match(TokenType3.question)) {
        state.restoreFromSnapshot(snapshot);
      }
    }
  }
  function tsParseTypeOperatorOrHigher() {
    if (isContextual(ContextualKeyword._keyof) || isContextual(ContextualKeyword._unique) || isContextual(ContextualKeyword._readonly)) {
      next();
      tsParseTypeOperatorOrHigher();
    } else if (isContextual(ContextualKeyword._infer)) {
      tsParseInferType();
    } else {
      const oldInDisallowConditionalTypesContext = state.inDisallowConditionalTypesContext;
      state.inDisallowConditionalTypesContext = false;
      tsParseArrayTypeOrHigher();
      state.inDisallowConditionalTypesContext = oldInDisallowConditionalTypesContext;
    }
  }
  function tsParseIntersectionTypeOrHigher() {
    eat2(TokenType3.bitwiseAND);
    tsParseTypeOperatorOrHigher();
    if (match(TokenType3.bitwiseAND)) {
      while (eat2(TokenType3.bitwiseAND)) {
        tsParseTypeOperatorOrHigher();
      }
    }
  }
  function tsParseUnionTypeOrHigher() {
    eat2(TokenType3.bitwiseOR);
    tsParseIntersectionTypeOrHigher();
    if (match(TokenType3.bitwiseOR)) {
      while (eat2(TokenType3.bitwiseOR)) {
        tsParseIntersectionTypeOrHigher();
      }
    }
  }
  function tsIsStartOfFunctionType() {
    if (match(TokenType3.lessThan)) {
      return true;
    }
    return match(TokenType3.parenL) && tsLookaheadIsUnambiguouslyStartOfFunctionType();
  }
  function tsSkipParameterStart() {
    if (match(TokenType3.name) || match(TokenType3._this)) {
      next();
      return true;
    }
    if (match(TokenType3.braceL) || match(TokenType3.bracketL)) {
      let depth = 1;
      next();
      while (depth > 0 && !state.error) {
        if (match(TokenType3.braceL) || match(TokenType3.bracketL)) {
          depth++;
        } else if (match(TokenType3.braceR) || match(TokenType3.bracketR)) {
          depth--;
        }
        next();
      }
      return true;
    }
    return false;
  }
  function tsLookaheadIsUnambiguouslyStartOfFunctionType() {
    const snapshot = state.snapshot();
    const isUnambiguouslyStartOfFunctionType = tsIsUnambiguouslyStartOfFunctionType();
    state.restoreFromSnapshot(snapshot);
    return isUnambiguouslyStartOfFunctionType;
  }
  function tsIsUnambiguouslyStartOfFunctionType() {
    next();
    if (match(TokenType3.parenR) || match(TokenType3.ellipsis)) {
      return true;
    }
    if (tsSkipParameterStart()) {
      if (match(TokenType3.colon) || match(TokenType3.comma) || match(TokenType3.question) || match(TokenType3.eq)) {
        return true;
      }
      if (match(TokenType3.parenR)) {
        next();
        if (match(TokenType3.arrow)) {
          return true;
        }
      }
    }
    return false;
  }
  function tsParseTypeOrTypePredicateAnnotation(returnToken) {
    const oldIsType = pushTypeContext(0);
    expect(returnToken);
    const finishedReturn = tsParseTypePredicateOrAssertsPrefix();
    if (!finishedReturn) {
      tsParseType();
    }
    popTypeContext(oldIsType);
  }
  function tsTryParseTypeOrTypePredicateAnnotation() {
    if (match(TokenType3.colon)) {
      tsParseTypeOrTypePredicateAnnotation(TokenType3.colon);
    }
  }
  function tsTryParseTypeAnnotation() {
    if (match(TokenType3.colon)) {
      tsParseTypeAnnotation();
    }
  }
  function tsTryParseType() {
    if (eat2(TokenType3.colon)) {
      tsParseType();
    }
  }
  function tsParseTypePredicateOrAssertsPrefix() {
    const snapshot = state.snapshot();
    if (isContextual(ContextualKeyword._asserts)) {
      next();
      if (eatContextual(ContextualKeyword._is)) {
        tsParseType();
        return true;
      } else if (tsIsIdentifier() || match(TokenType3._this)) {
        next();
        if (eatContextual(ContextualKeyword._is)) {
          tsParseType();
        }
        return true;
      } else {
        state.restoreFromSnapshot(snapshot);
        return false;
      }
    } else if (tsIsIdentifier() || match(TokenType3._this)) {
      next();
      if (isContextual(ContextualKeyword._is) && !hasPrecedingLineBreak()) {
        next();
        tsParseType();
        return true;
      } else {
        state.restoreFromSnapshot(snapshot);
        return false;
      }
    }
    return false;
  }
  function tsParseTypeAnnotation() {
    const oldIsType = pushTypeContext(0);
    expect(TokenType3.colon);
    tsParseType();
    popTypeContext(oldIsType);
  }
  function tsParseType() {
    tsParseNonConditionalType();
    if (state.inDisallowConditionalTypesContext || hasPrecedingLineBreak() || !eat2(TokenType3._extends)) {
      return;
    }
    const oldInDisallowConditionalTypesContext = state.inDisallowConditionalTypesContext;
    state.inDisallowConditionalTypesContext = true;
    tsParseNonConditionalType();
    state.inDisallowConditionalTypesContext = oldInDisallowConditionalTypesContext;
    expect(TokenType3.question);
    tsParseType();
    expect(TokenType3.colon);
    tsParseType();
  }
  function isAbstractConstructorSignature() {
    return isContextual(ContextualKeyword._abstract) && lookaheadType() === TokenType3._new;
  }
  function tsParseNonConditionalType() {
    if (tsIsStartOfFunctionType()) {
      tsParseFunctionOrConstructorType(FunctionType.TSFunctionType);
      return;
    }
    if (match(TokenType3._new)) {
      tsParseFunctionOrConstructorType(FunctionType.TSConstructorType);
      return;
    } else if (isAbstractConstructorSignature()) {
      tsParseFunctionOrConstructorType(FunctionType.TSAbstractConstructorType);
      return;
    }
    tsParseUnionTypeOrHigher();
  }
  function tsParseTypeAssertion() {
    const oldIsType = pushTypeContext(1);
    tsParseType();
    expect(TokenType3.greaterThan);
    popTypeContext(oldIsType);
    parseMaybeUnary();
  }
  function tsTryParseJSXTypeArgument() {
    if (eat2(TokenType3.jsxTagStart)) {
      state.tokens[state.tokens.length - 1].type = TokenType3.typeParameterStart;
      const oldIsType = pushTypeContext(1);
      while (!match(TokenType3.greaterThan) && !state.error) {
        tsParseType();
        eat2(TokenType3.comma);
      }
      nextJSXTagToken();
      popTypeContext(oldIsType);
    }
  }
  function tsParseHeritageClause() {
    while (!match(TokenType3.braceL) && !state.error) {
      tsParseExpressionWithTypeArguments();
      eat2(TokenType3.comma);
    }
  }
  function tsParseExpressionWithTypeArguments() {
    tsParseEntityName();
    if (match(TokenType3.lessThan)) {
      tsParseTypeArguments();
    }
  }
  function tsParseInterfaceDeclaration() {
    parseBindingIdentifier(false);
    tsTryParseTypeParameters();
    if (eat2(TokenType3._extends)) {
      tsParseHeritageClause();
    }
    tsParseObjectTypeMembers();
  }
  function tsParseTypeAliasDeclaration() {
    parseBindingIdentifier(false);
    tsTryParseTypeParameters();
    expect(TokenType3.eq);
    tsParseType();
    semicolon();
  }
  function tsParseEnumMember() {
    if (match(TokenType3.string)) {
      parseLiteral();
    } else {
      parseIdentifier();
    }
    if (eat2(TokenType3.eq)) {
      const eqIndex = state.tokens.length - 1;
      parseMaybeAssign();
      state.tokens[eqIndex].rhsEndIndex = state.tokens.length;
    }
  }
  function tsParseEnumDeclaration() {
    parseBindingIdentifier(false);
    expect(TokenType3.braceL);
    while (!eat2(TokenType3.braceR) && !state.error) {
      tsParseEnumMember();
      eat2(TokenType3.comma);
    }
  }
  function tsParseModuleBlock() {
    expect(TokenType3.braceL);
    parseBlockBody(
      /* end */
      TokenType3.braceR
    );
  }
  function tsParseModuleOrNamespaceDeclaration() {
    parseBindingIdentifier(false);
    if (eat2(TokenType3.dot)) {
      tsParseModuleOrNamespaceDeclaration();
    } else {
      tsParseModuleBlock();
    }
  }
  function tsParseAmbientExternalModuleDeclaration() {
    if (isContextual(ContextualKeyword._global)) {
      parseIdentifier();
    } else if (match(TokenType3.string)) {
      parseExprAtom();
    } else {
      unexpected();
    }
    if (match(TokenType3.braceL)) {
      tsParseModuleBlock();
    } else {
      semicolon();
    }
  }
  function tsParseImportEqualsDeclaration() {
    parseImportedIdentifier();
    expect(TokenType3.eq);
    tsParseModuleReference();
    semicolon();
  }
  function tsIsExternalModuleReference() {
    return isContextual(ContextualKeyword._require) && lookaheadType() === TokenType3.parenL;
  }
  function tsParseModuleReference() {
    if (tsIsExternalModuleReference()) {
      tsParseExternalModuleReference();
    } else {
      tsParseEntityName();
    }
  }
  function tsParseExternalModuleReference() {
    expectContextual(ContextualKeyword._require);
    expect(TokenType3.parenL);
    if (!match(TokenType3.string)) {
      unexpected();
    }
    parseLiteral();
    expect(TokenType3.parenR);
  }
  function tsTryParseDeclare() {
    if (isLineTerminator()) {
      return false;
    }
    switch (state.type) {
      case TokenType3._function: {
        const oldIsType = pushTypeContext(1);
        next();
        const functionStart = state.start;
        parseFunction(
          functionStart,
          /* isStatement */
          true
        );
        popTypeContext(oldIsType);
        return true;
      }
      case TokenType3._class: {
        const oldIsType = pushTypeContext(1);
        parseClass(
          /* isStatement */
          true,
          /* optionalId */
          false
        );
        popTypeContext(oldIsType);
        return true;
      }
      case TokenType3._const: {
        if (match(TokenType3._const) && isLookaheadContextual(ContextualKeyword._enum)) {
          const oldIsType = pushTypeContext(1);
          expect(TokenType3._const);
          expectContextual(ContextualKeyword._enum);
          state.tokens[state.tokens.length - 1].type = TokenType3._enum;
          tsParseEnumDeclaration();
          popTypeContext(oldIsType);
          return true;
        }
      }
      // falls through
      case TokenType3._var:
      case TokenType3._let: {
        const oldIsType = pushTypeContext(1);
        parseVarStatement(state.type !== TokenType3._var);
        popTypeContext(oldIsType);
        return true;
      }
      case TokenType3.name: {
        const oldIsType = pushTypeContext(1);
        const contextualKeyword = state.contextualKeyword;
        let matched = false;
        if (contextualKeyword === ContextualKeyword._global) {
          tsParseAmbientExternalModuleDeclaration();
          matched = true;
        } else {
          matched = tsParseDeclaration(
            contextualKeyword,
            /* isBeforeToken */
            true
          );
        }
        popTypeContext(oldIsType);
        return matched;
      }
      default:
        return false;
    }
  }
  function tsTryParseExportDeclaration() {
    return tsParseDeclaration(
      state.contextualKeyword,
      /* isBeforeToken */
      true
    );
  }
  function tsParseExpressionStatement(contextualKeyword) {
    switch (contextualKeyword) {
      case ContextualKeyword._declare: {
        const declareTokenIndex = state.tokens.length - 1;
        const matched = tsTryParseDeclare();
        if (matched) {
          state.tokens[declareTokenIndex].type = TokenType3._declare;
          return true;
        }
        break;
      }
      case ContextualKeyword._global:
        if (match(TokenType3.braceL)) {
          tsParseModuleBlock();
          return true;
        }
        break;
      default:
        return tsParseDeclaration(
          contextualKeyword,
          /* isBeforeToken */
          false
        );
    }
    return false;
  }
  function tsParseDeclaration(contextualKeyword, isBeforeToken) {
    switch (contextualKeyword) {
      case ContextualKeyword._abstract:
        if (tsCheckLineTerminator(isBeforeToken) && match(TokenType3._class)) {
          state.tokens[state.tokens.length - 1].type = TokenType3._abstract;
          parseClass(
            /* isStatement */
            true,
            /* optionalId */
            false
          );
          return true;
        }
        break;
      case ContextualKeyword._enum:
        if (tsCheckLineTerminator(isBeforeToken) && match(TokenType3.name)) {
          state.tokens[state.tokens.length - 1].type = TokenType3._enum;
          tsParseEnumDeclaration();
          return true;
        }
        break;
      case ContextualKeyword._interface:
        if (tsCheckLineTerminator(isBeforeToken) && match(TokenType3.name)) {
          const oldIsType = pushTypeContext(isBeforeToken ? 2 : 1);
          tsParseInterfaceDeclaration();
          popTypeContext(oldIsType);
          return true;
        }
        break;
      case ContextualKeyword._module:
        if (tsCheckLineTerminator(isBeforeToken)) {
          if (match(TokenType3.string)) {
            const oldIsType = pushTypeContext(isBeforeToken ? 2 : 1);
            tsParseAmbientExternalModuleDeclaration();
            popTypeContext(oldIsType);
            return true;
          } else if (match(TokenType3.name)) {
            const oldIsType = pushTypeContext(isBeforeToken ? 2 : 1);
            tsParseModuleOrNamespaceDeclaration();
            popTypeContext(oldIsType);
            return true;
          }
        }
        break;
      case ContextualKeyword._namespace:
        if (tsCheckLineTerminator(isBeforeToken) && match(TokenType3.name)) {
          const oldIsType = pushTypeContext(isBeforeToken ? 2 : 1);
          tsParseModuleOrNamespaceDeclaration();
          popTypeContext(oldIsType);
          return true;
        }
        break;
      case ContextualKeyword._type:
        if (tsCheckLineTerminator(isBeforeToken) && match(TokenType3.name)) {
          const oldIsType = pushTypeContext(isBeforeToken ? 2 : 1);
          tsParseTypeAliasDeclaration();
          popTypeContext(oldIsType);
          return true;
        }
        break;
      default:
        break;
    }
    return false;
  }
  function tsCheckLineTerminator(isBeforeToken) {
    if (isBeforeToken) {
      next();
      return true;
    } else {
      return !isLineTerminator();
    }
  }
  function tsTryParseGenericAsyncArrowFunction() {
    const snapshot = state.snapshot();
    tsParseTypeParameters();
    parseFunctionParams();
    tsTryParseTypeOrTypePredicateAnnotation();
    expect(TokenType3.arrow);
    if (state.error) {
      state.restoreFromSnapshot(snapshot);
      return false;
    }
    parseFunctionBody(true);
    return true;
  }
  function tsParseTypeArgumentsWithPossibleBitshift() {
    if (state.type === TokenType3.bitShiftL) {
      state.pos -= 1;
      finishToken(TokenType3.lessThan);
    }
    tsParseTypeArguments();
  }
  function tsParseTypeArguments() {
    const oldIsType = pushTypeContext(0);
    expect(TokenType3.lessThan);
    while (!match(TokenType3.greaterThan) && !state.error) {
      tsParseType();
      eat2(TokenType3.comma);
    }
    if (!oldIsType) {
      popTypeContext(oldIsType);
      rescan_gt();
      expect(TokenType3.greaterThan);
      state.tokens[state.tokens.length - 1].isType = true;
    } else {
      expect(TokenType3.greaterThan);
      popTypeContext(oldIsType);
    }
  }
  function tsIsDeclarationStart() {
    if (match(TokenType3.name)) {
      switch (state.contextualKeyword) {
        case ContextualKeyword._abstract:
        case ContextualKeyword._declare:
        case ContextualKeyword._enum:
        case ContextualKeyword._interface:
        case ContextualKeyword._module:
        case ContextualKeyword._namespace:
        case ContextualKeyword._type:
          return true;
        default:
          break;
      }
    }
    return false;
  }
  function tsParseFunctionBodyAndFinish(functionStart, funcContextId) {
    if (match(TokenType3.colon)) {
      tsParseTypeOrTypePredicateAnnotation(TokenType3.colon);
    }
    if (!match(TokenType3.braceL) && isLineTerminator()) {
      let i = state.tokens.length - 1;
      while (i >= 0 && (state.tokens[i].start >= functionStart || state.tokens[i].type === TokenType3._default || state.tokens[i].type === TokenType3._export)) {
        state.tokens[i].isType = true;
        i--;
      }
      return;
    }
    parseFunctionBody(false, funcContextId);
  }
  function tsParseSubscript(startTokenIndex, noCalls, stopState) {
    if (!hasPrecedingLineBreak() && eat2(TokenType3.bang)) {
      state.tokens[state.tokens.length - 1].type = TokenType3.nonNullAssertion;
      return;
    }
    if (match(TokenType3.lessThan) || match(TokenType3.bitShiftL)) {
      const snapshot = state.snapshot();
      if (!noCalls && atPossibleAsync()) {
        const asyncArrowFn = tsTryParseGenericAsyncArrowFunction();
        if (asyncArrowFn) {
          return;
        }
      }
      tsParseTypeArgumentsWithPossibleBitshift();
      if (!noCalls && eat2(TokenType3.parenL)) {
        state.tokens[state.tokens.length - 1].subscriptStartIndex = startTokenIndex;
        parseCallExpressionArguments();
      } else if (match(TokenType3.backQuote)) {
        parseTemplate();
      } else if (
        // The remaining possible case is an instantiation expression, e.g.
        // Array<number> . Check for a few cases that would disqualify it and
        // cause us to bail out.
        // a<b>>c is not (a<b>)>c, but a<(b>>c)
        state.type === TokenType3.greaterThan || // a<b>c is (a<b)>c
        state.type !== TokenType3.parenL && Boolean(state.type & TokenType3.IS_EXPRESSION_START) && !hasPrecedingLineBreak()
      ) {
        unexpected();
      }
      if (state.error) {
        state.restoreFromSnapshot(snapshot);
      } else {
        return;
      }
    } else if (!noCalls && match(TokenType3.questionDot) && lookaheadType() === TokenType3.lessThan) {
      next();
      state.tokens[startTokenIndex].isOptionalChainStart = true;
      state.tokens[state.tokens.length - 1].subscriptStartIndex = startTokenIndex;
      tsParseTypeArguments();
      expect(TokenType3.parenL);
      parseCallExpressionArguments();
    }
    baseParseSubscript(startTokenIndex, noCalls, stopState);
  }
  function tsTryParseExport() {
    if (eat2(TokenType3._import)) {
      if (isContextual(ContextualKeyword._type) && lookaheadType() !== TokenType3.eq) {
        expectContextual(ContextualKeyword._type);
      }
      tsParseImportEqualsDeclaration();
      return true;
    } else if (eat2(TokenType3.eq)) {
      parseExpression();
      semicolon();
      return true;
    } else if (eatContextual(ContextualKeyword._as)) {
      expectContextual(ContextualKeyword._namespace);
      parseIdentifier();
      semicolon();
      return true;
    } else {
      if (isContextual(ContextualKeyword._type)) {
        const nextType = lookaheadType();
        if (nextType === TokenType3.braceL || nextType === TokenType3.star) {
          next();
        }
      }
      return false;
    }
  }
  function tsParseImportSpecifier() {
    parseIdentifier();
    if (match(TokenType3.comma) || match(TokenType3.braceR)) {
      state.tokens[state.tokens.length - 1].identifierRole = IdentifierRole.ImportDeclaration;
      return;
    }
    parseIdentifier();
    if (match(TokenType3.comma) || match(TokenType3.braceR)) {
      state.tokens[state.tokens.length - 1].identifierRole = IdentifierRole.ImportDeclaration;
      state.tokens[state.tokens.length - 2].isType = true;
      state.tokens[state.tokens.length - 1].isType = true;
      return;
    }
    parseIdentifier();
    if (match(TokenType3.comma) || match(TokenType3.braceR)) {
      state.tokens[state.tokens.length - 3].identifierRole = IdentifierRole.ImportAccess;
      state.tokens[state.tokens.length - 1].identifierRole = IdentifierRole.ImportDeclaration;
      return;
    }
    parseIdentifier();
    state.tokens[state.tokens.length - 3].identifierRole = IdentifierRole.ImportAccess;
    state.tokens[state.tokens.length - 1].identifierRole = IdentifierRole.ImportDeclaration;
    state.tokens[state.tokens.length - 4].isType = true;
    state.tokens[state.tokens.length - 3].isType = true;
    state.tokens[state.tokens.length - 2].isType = true;
    state.tokens[state.tokens.length - 1].isType = true;
  }
  function tsParseExportSpecifier() {
    parseIdentifier();
    if (match(TokenType3.comma) || match(TokenType3.braceR)) {
      state.tokens[state.tokens.length - 1].identifierRole = IdentifierRole.ExportAccess;
      return;
    }
    parseIdentifier();
    if (match(TokenType3.comma) || match(TokenType3.braceR)) {
      state.tokens[state.tokens.length - 1].identifierRole = IdentifierRole.ExportAccess;
      state.tokens[state.tokens.length - 2].isType = true;
      state.tokens[state.tokens.length - 1].isType = true;
      return;
    }
    parseIdentifier();
    if (match(TokenType3.comma) || match(TokenType3.braceR)) {
      state.tokens[state.tokens.length - 3].identifierRole = IdentifierRole.ExportAccess;
      return;
    }
    parseIdentifier();
    state.tokens[state.tokens.length - 3].identifierRole = IdentifierRole.ExportAccess;
    state.tokens[state.tokens.length - 4].isType = true;
    state.tokens[state.tokens.length - 3].isType = true;
    state.tokens[state.tokens.length - 2].isType = true;
    state.tokens[state.tokens.length - 1].isType = true;
  }
  function tsTryParseExportDefaultExpression() {
    if (isContextual(ContextualKeyword._abstract) && lookaheadType() === TokenType3._class) {
      state.type = TokenType3._abstract;
      next();
      parseClass(true, true);
      return true;
    }
    if (isContextual(ContextualKeyword._interface)) {
      const oldIsType = pushTypeContext(2);
      tsParseDeclaration(ContextualKeyword._interface, true);
      popTypeContext(oldIsType);
      return true;
    }
    return false;
  }
  function tsTryParseStatementContent() {
    if (state.type === TokenType3._const) {
      const ahead = lookaheadTypeAndKeyword();
      if (ahead.type === TokenType3.name && ahead.contextualKeyword === ContextualKeyword._enum) {
        expect(TokenType3._const);
        expectContextual(ContextualKeyword._enum);
        state.tokens[state.tokens.length - 1].type = TokenType3._enum;
        tsParseEnumDeclaration();
        return true;
      }
    }
    return false;
  }
  function tsTryParseClassMemberWithIsStatic(isStatic) {
    const memberStartIndexAfterStatic = state.tokens.length;
    tsParseModifiers([
      ContextualKeyword._abstract,
      ContextualKeyword._readonly,
      ContextualKeyword._declare,
      ContextualKeyword._static,
      ContextualKeyword._override
    ]);
    const modifiersEndIndex = state.tokens.length;
    const found = tsTryParseIndexSignature();
    if (found) {
      const memberStartIndex = isStatic ? memberStartIndexAfterStatic - 1 : memberStartIndexAfterStatic;
      for (let i = memberStartIndex; i < modifiersEndIndex; i++) {
        state.tokens[i].isType = true;
      }
      return true;
    }
    return false;
  }
  function tsParseIdentifierStatement(contextualKeyword) {
    const matched = tsParseExpressionStatement(contextualKeyword);
    if (!matched) {
      semicolon();
    }
  }
  function tsParseExportDeclaration() {
    const isDeclare = eatContextual(ContextualKeyword._declare);
    if (isDeclare) {
      state.tokens[state.tokens.length - 1].type = TokenType3._declare;
    }
    let matchedDeclaration = false;
    if (match(TokenType3.name)) {
      if (isDeclare) {
        const oldIsType = pushTypeContext(2);
        matchedDeclaration = tsTryParseExportDeclaration();
        popTypeContext(oldIsType);
      } else {
        matchedDeclaration = tsTryParseExportDeclaration();
      }
    }
    if (!matchedDeclaration) {
      if (isDeclare) {
        const oldIsType = pushTypeContext(2);
        parseStatement(true);
        popTypeContext(oldIsType);
      } else {
        parseStatement(true);
      }
    }
  }
  function tsAfterParseClassSuper(hasSuper) {
    if (hasSuper && (match(TokenType3.lessThan) || match(TokenType3.bitShiftL))) {
      tsParseTypeArgumentsWithPossibleBitshift();
    }
    if (eatContextual(ContextualKeyword._implements)) {
      state.tokens[state.tokens.length - 1].type = TokenType3._implements;
      const oldIsType = pushTypeContext(1);
      tsParseHeritageClause();
      popTypeContext(oldIsType);
    }
  }
  function tsStartParseObjPropValue() {
    tsTryParseTypeParameters();
  }
  function tsStartParseFunctionParams() {
    tsTryParseTypeParameters();
  }
  function tsAfterParseVarHead() {
    const oldIsType = pushTypeContext(0);
    if (!hasPrecedingLineBreak()) {
      eat2(TokenType3.bang);
    }
    tsTryParseTypeAnnotation();
    popTypeContext(oldIsType);
  }
  function tsStartParseAsyncArrowFromCallExpression() {
    if (match(TokenType3.colon)) {
      tsParseTypeAnnotation();
    }
  }
  function tsParseMaybeAssign(noIn, isWithinParens) {
    if (isJSXEnabled) {
      return tsParseMaybeAssignWithJSX(noIn, isWithinParens);
    } else {
      return tsParseMaybeAssignWithoutJSX(noIn, isWithinParens);
    }
  }
  function tsParseMaybeAssignWithJSX(noIn, isWithinParens) {
    if (!match(TokenType3.lessThan)) {
      return baseParseMaybeAssign(noIn, isWithinParens);
    }
    const snapshot = state.snapshot();
    let wasArrow = baseParseMaybeAssign(noIn, isWithinParens);
    if (state.error) {
      state.restoreFromSnapshot(snapshot);
    } else {
      return wasArrow;
    }
    state.type = TokenType3.typeParameterStart;
    tsParseTypeParameters();
    wasArrow = baseParseMaybeAssign(noIn, isWithinParens);
    if (!wasArrow) {
      unexpected();
    }
    return wasArrow;
  }
  function tsParseMaybeAssignWithoutJSX(noIn, isWithinParens) {
    if (!match(TokenType3.lessThan)) {
      return baseParseMaybeAssign(noIn, isWithinParens);
    }
    const snapshot = state.snapshot();
    tsParseTypeParameters();
    const wasArrow = baseParseMaybeAssign(noIn, isWithinParens);
    if (!wasArrow) {
      unexpected();
    }
    if (state.error) {
      state.restoreFromSnapshot(snapshot);
    } else {
      return wasArrow;
    }
    return baseParseMaybeAssign(noIn, isWithinParens);
  }
  function tsParseArrow() {
    if (match(TokenType3.colon)) {
      const snapshot = state.snapshot();
      tsParseTypeOrTypePredicateAnnotation(TokenType3.colon);
      if (canInsertSemicolon()) unexpected();
      if (!match(TokenType3.arrow)) unexpected();
      if (state.error) {
        state.restoreFromSnapshot(snapshot);
      }
    }
    return eat2(TokenType3.arrow);
  }
  function tsParseAssignableListItemTypes() {
    const oldIsType = pushTypeContext(0);
    eat2(TokenType3.question);
    tsTryParseTypeAnnotation();
    popTypeContext(oldIsType);
  }
  function tsParseMaybeDecoratorArguments() {
    if (match(TokenType3.lessThan) || match(TokenType3.bitShiftL)) {
      tsParseTypeArgumentsWithPossibleBitshift();
    }
    baseParseMaybeDecoratorArguments();
  }

  // node_modules/sucrase/dist/esm/parser/plugins/jsx/index.js
  function jsxReadToken() {
    let sawNewline = false;
    let sawNonWhitespace = false;
    while (true) {
      if (state.pos >= input.length) {
        unexpected("Unterminated JSX contents");
        return;
      }
      const ch = input.charCodeAt(state.pos);
      if (ch === charCodes.lessThan || ch === charCodes.leftCurlyBrace) {
        if (state.pos === state.start) {
          if (ch === charCodes.lessThan) {
            state.pos++;
            finishToken(TokenType3.jsxTagStart);
            return;
          }
          getTokenFromCode(ch);
          return;
        }
        if (sawNewline && !sawNonWhitespace) {
          finishToken(TokenType3.jsxEmptyText);
        } else {
          finishToken(TokenType3.jsxText);
        }
        return;
      }
      if (ch === charCodes.lineFeed) {
        sawNewline = true;
      } else if (ch !== charCodes.space && ch !== charCodes.carriageReturn && ch !== charCodes.tab) {
        sawNonWhitespace = true;
      }
      state.pos++;
    }
  }
  function jsxReadString(quote) {
    state.pos++;
    for (; ; ) {
      if (state.pos >= input.length) {
        unexpected("Unterminated string constant");
        return;
      }
      const ch = input.charCodeAt(state.pos);
      if (ch === quote) {
        state.pos++;
        break;
      }
      state.pos++;
    }
    finishToken(TokenType3.string);
  }
  function jsxReadWord() {
    let ch;
    do {
      if (state.pos > input.length) {
        unexpected("Unexpectedly reached the end of input.");
        return;
      }
      ch = input.charCodeAt(++state.pos);
    } while (IS_IDENTIFIER_CHAR[ch] || ch === charCodes.dash);
    finishToken(TokenType3.jsxName);
  }
  function jsxParseIdentifier() {
    nextJSXTagToken();
  }
  function jsxParseNamespacedName(identifierRole) {
    jsxParseIdentifier();
    if (!eat2(TokenType3.colon)) {
      state.tokens[state.tokens.length - 1].identifierRole = identifierRole;
      return;
    }
    jsxParseIdentifier();
  }
  function jsxParseElementName() {
    const firstTokenIndex = state.tokens.length;
    jsxParseNamespacedName(IdentifierRole.Access);
    let hadDot = false;
    while (match(TokenType3.dot)) {
      hadDot = true;
      nextJSXTagToken();
      jsxParseIdentifier();
    }
    if (!hadDot) {
      const firstToken = state.tokens[firstTokenIndex];
      const firstChar = input.charCodeAt(firstToken.start);
      if (firstChar >= charCodes.lowercaseA && firstChar <= charCodes.lowercaseZ) {
        firstToken.identifierRole = null;
      }
    }
  }
  function jsxParseAttributeValue() {
    switch (state.type) {
      case TokenType3.braceL:
        next();
        parseExpression();
        nextJSXTagToken();
        return;
      case TokenType3.jsxTagStart:
        jsxParseElement();
        nextJSXTagToken();
        return;
      case TokenType3.string:
        nextJSXTagToken();
        return;
      default:
        unexpected("JSX value should be either an expression or a quoted JSX text");
    }
  }
  function jsxParseSpreadChild() {
    expect(TokenType3.ellipsis);
    parseExpression();
  }
  function jsxParseOpeningElement(initialTokenIndex) {
    if (match(TokenType3.jsxTagEnd)) {
      return false;
    }
    jsxParseElementName();
    if (isTypeScriptEnabled) {
      tsTryParseJSXTypeArgument();
    }
    let hasSeenPropSpread = false;
    while (!match(TokenType3.slash) && !match(TokenType3.jsxTagEnd) && !state.error) {
      if (eat2(TokenType3.braceL)) {
        hasSeenPropSpread = true;
        expect(TokenType3.ellipsis);
        parseMaybeAssign();
        nextJSXTagToken();
        continue;
      }
      if (hasSeenPropSpread && state.end - state.start === 3 && input.charCodeAt(state.start) === charCodes.lowercaseK && input.charCodeAt(state.start + 1) === charCodes.lowercaseE && input.charCodeAt(state.start + 2) === charCodes.lowercaseY) {
        state.tokens[initialTokenIndex].jsxRole = JSXRole.KeyAfterPropSpread;
      }
      jsxParseNamespacedName(IdentifierRole.ObjectKey);
      if (match(TokenType3.eq)) {
        nextJSXTagToken();
        jsxParseAttributeValue();
      }
    }
    const isSelfClosing = match(TokenType3.slash);
    if (isSelfClosing) {
      nextJSXTagToken();
    }
    return isSelfClosing;
  }
  function jsxParseClosingElement() {
    if (match(TokenType3.jsxTagEnd)) {
      return;
    }
    jsxParseElementName();
  }
  function jsxParseElementAt() {
    const initialTokenIndex = state.tokens.length - 1;
    state.tokens[initialTokenIndex].jsxRole = JSXRole.NoChildren;
    let numExplicitChildren = 0;
    const isSelfClosing = jsxParseOpeningElement(initialTokenIndex);
    if (!isSelfClosing) {
      nextJSXExprToken();
      while (true) {
        switch (state.type) {
          case TokenType3.jsxTagStart:
            nextJSXTagToken();
            if (match(TokenType3.slash)) {
              nextJSXTagToken();
              jsxParseClosingElement();
              if (state.tokens[initialTokenIndex].jsxRole !== JSXRole.KeyAfterPropSpread) {
                if (numExplicitChildren === 1) {
                  state.tokens[initialTokenIndex].jsxRole = JSXRole.OneChild;
                } else if (numExplicitChildren > 1) {
                  state.tokens[initialTokenIndex].jsxRole = JSXRole.StaticChildren;
                }
              }
              return;
            }
            numExplicitChildren++;
            jsxParseElementAt();
            nextJSXExprToken();
            break;
          case TokenType3.jsxText:
            numExplicitChildren++;
            nextJSXExprToken();
            break;
          case TokenType3.jsxEmptyText:
            nextJSXExprToken();
            break;
          case TokenType3.braceL:
            next();
            if (match(TokenType3.ellipsis)) {
              jsxParseSpreadChild();
              nextJSXExprToken();
              numExplicitChildren += 2;
            } else {
              if (!match(TokenType3.braceR)) {
                numExplicitChildren++;
                parseExpression();
              }
              nextJSXExprToken();
            }
            break;
          // istanbul ignore next - should never happen
          default:
            unexpected();
            return;
        }
      }
    }
  }
  function jsxParseElement() {
    nextJSXTagToken();
    jsxParseElementAt();
  }
  function nextJSXTagToken() {
    state.tokens.push(new Token3());
    skipSpace();
    state.start = state.pos;
    const code = input.charCodeAt(state.pos);
    if (IS_IDENTIFIER_START[code]) {
      jsxReadWord();
    } else if (code === charCodes.quotationMark || code === charCodes.apostrophe) {
      jsxReadString(code);
    } else {
      ++state.pos;
      switch (code) {
        case charCodes.greaterThan:
          finishToken(TokenType3.jsxTagEnd);
          break;
        case charCodes.lessThan:
          finishToken(TokenType3.jsxTagStart);
          break;
        case charCodes.slash:
          finishToken(TokenType3.slash);
          break;
        case charCodes.equalsTo:
          finishToken(TokenType3.eq);
          break;
        case charCodes.leftCurlyBrace:
          finishToken(TokenType3.braceL);
          break;
        case charCodes.dot:
          finishToken(TokenType3.dot);
          break;
        case charCodes.colon:
          finishToken(TokenType3.colon);
          break;
        default:
          unexpected();
      }
    }
  }
  function nextJSXExprToken() {
    state.tokens.push(new Token3());
    state.start = state.pos;
    jsxReadToken();
  }

  // node_modules/sucrase/dist/esm/parser/plugins/types.js
  function typedParseConditional(noIn) {
    if (match(TokenType3.question)) {
      const nextType = lookaheadType();
      if (nextType === TokenType3.colon || nextType === TokenType3.comma || nextType === TokenType3.parenR) {
        return;
      }
    }
    baseParseConditional(noIn);
  }
  function typedParseParenItem() {
    eatTypeToken(TokenType3.question);
    if (match(TokenType3.colon)) {
      if (isTypeScriptEnabled) {
        tsParseTypeAnnotation();
      } else if (isFlowEnabled) {
        flowParseTypeAnnotation();
      }
    }
  }

  // node_modules/sucrase/dist/esm/parser/traverser/expression.js
  var StopState = class {
    constructor(stop) {
      this.stop = stop;
    }
  };
  function parseExpression(noIn = false) {
    parseMaybeAssign(noIn);
    if (match(TokenType3.comma)) {
      while (eat2(TokenType3.comma)) {
        parseMaybeAssign(noIn);
      }
    }
  }
  function parseMaybeAssign(noIn = false, isWithinParens = false) {
    if (isTypeScriptEnabled) {
      return tsParseMaybeAssign(noIn, isWithinParens);
    } else if (isFlowEnabled) {
      return flowParseMaybeAssign(noIn, isWithinParens);
    } else {
      return baseParseMaybeAssign(noIn, isWithinParens);
    }
  }
  function baseParseMaybeAssign(noIn, isWithinParens) {
    if (match(TokenType3._yield)) {
      parseYield();
      return false;
    }
    if (match(TokenType3.parenL) || match(TokenType3.name) || match(TokenType3._yield)) {
      state.potentialArrowAt = state.start;
    }
    const wasArrow = parseMaybeConditional(noIn);
    if (isWithinParens) {
      parseParenItem();
    }
    if (state.type & TokenType3.IS_ASSIGN) {
      next();
      parseMaybeAssign(noIn);
      return false;
    }
    return wasArrow;
  }
  function parseMaybeConditional(noIn) {
    const wasArrow = parseExprOps(noIn);
    if (wasArrow) {
      return true;
    }
    parseConditional(noIn);
    return false;
  }
  function parseConditional(noIn) {
    if (isTypeScriptEnabled || isFlowEnabled) {
      typedParseConditional(noIn);
    } else {
      baseParseConditional(noIn);
    }
  }
  function baseParseConditional(noIn) {
    if (eat2(TokenType3.question)) {
      parseMaybeAssign();
      expect(TokenType3.colon);
      parseMaybeAssign(noIn);
    }
  }
  function parseExprOps(noIn) {
    const startTokenIndex = state.tokens.length;
    const wasArrow = parseMaybeUnary();
    if (wasArrow) {
      return true;
    }
    parseExprOp(startTokenIndex, -1, noIn);
    return false;
  }
  function parseExprOp(startTokenIndex, minPrec, noIn) {
    if (isTypeScriptEnabled && (TokenType3._in & TokenType3.PRECEDENCE_MASK) > minPrec && !hasPrecedingLineBreak() && (eatContextual(ContextualKeyword._as) || eatContextual(ContextualKeyword._satisfies))) {
      const oldIsType = pushTypeContext(1);
      tsParseType();
      popTypeContext(oldIsType);
      rescan_gt();
      parseExprOp(startTokenIndex, minPrec, noIn);
      return;
    }
    const prec = state.type & TokenType3.PRECEDENCE_MASK;
    if (prec > 0 && (!noIn || !match(TokenType3._in))) {
      if (prec > minPrec) {
        const op = state.type;
        next();
        if (op === TokenType3.nullishCoalescing) {
          state.tokens[state.tokens.length - 1].nullishStartIndex = startTokenIndex;
        }
        const rhsStartTokenIndex = state.tokens.length;
        parseMaybeUnary();
        parseExprOp(rhsStartTokenIndex, op & TokenType3.IS_RIGHT_ASSOCIATIVE ? prec - 1 : prec, noIn);
        if (op === TokenType3.nullishCoalescing) {
          state.tokens[startTokenIndex].numNullishCoalesceStarts++;
          state.tokens[state.tokens.length - 1].numNullishCoalesceEnds++;
        }
        parseExprOp(startTokenIndex, minPrec, noIn);
      }
    }
  }
  function parseMaybeUnary() {
    if (isTypeScriptEnabled && !isJSXEnabled && eat2(TokenType3.lessThan)) {
      tsParseTypeAssertion();
      return false;
    }
    if (isContextual(ContextualKeyword._module) && lookaheadCharCode() === charCodes.leftCurlyBrace && !hasFollowingLineBreak()) {
      parseModuleExpression();
      return false;
    }
    if (state.type & TokenType3.IS_PREFIX) {
      next();
      parseMaybeUnary();
      return false;
    }
    const wasArrow = parseExprSubscripts();
    if (wasArrow) {
      return true;
    }
    while (state.type & TokenType3.IS_POSTFIX && !canInsertSemicolon()) {
      if (state.type === TokenType3.preIncDec) {
        state.type = TokenType3.postIncDec;
      }
      next();
    }
    return false;
  }
  function parseExprSubscripts() {
    const startTokenIndex = state.tokens.length;
    const wasArrow = parseExprAtom();
    if (wasArrow) {
      return true;
    }
    parseSubscripts(startTokenIndex);
    if (state.tokens.length > startTokenIndex && state.tokens[startTokenIndex].isOptionalChainStart) {
      state.tokens[state.tokens.length - 1].isOptionalChainEnd = true;
    }
    return false;
  }
  function parseSubscripts(startTokenIndex, noCalls = false) {
    if (isFlowEnabled) {
      flowParseSubscripts(startTokenIndex, noCalls);
    } else {
      baseParseSubscripts(startTokenIndex, noCalls);
    }
  }
  function baseParseSubscripts(startTokenIndex, noCalls = false) {
    const stopState = new StopState(false);
    do {
      parseSubscript(startTokenIndex, noCalls, stopState);
    } while (!stopState.stop && !state.error);
  }
  function parseSubscript(startTokenIndex, noCalls, stopState) {
    if (isTypeScriptEnabled) {
      tsParseSubscript(startTokenIndex, noCalls, stopState);
    } else if (isFlowEnabled) {
      flowParseSubscript(startTokenIndex, noCalls, stopState);
    } else {
      baseParseSubscript(startTokenIndex, noCalls, stopState);
    }
  }
  function baseParseSubscript(startTokenIndex, noCalls, stopState) {
    if (!noCalls && eat2(TokenType3.doubleColon)) {
      parseNoCallExpr();
      stopState.stop = true;
      parseSubscripts(startTokenIndex, noCalls);
    } else if (match(TokenType3.questionDot)) {
      state.tokens[startTokenIndex].isOptionalChainStart = true;
      if (noCalls && lookaheadType() === TokenType3.parenL) {
        stopState.stop = true;
        return;
      }
      next();
      state.tokens[state.tokens.length - 1].subscriptStartIndex = startTokenIndex;
      if (eat2(TokenType3.bracketL)) {
        parseExpression();
        expect(TokenType3.bracketR);
      } else if (eat2(TokenType3.parenL)) {
        parseCallExpressionArguments();
      } else {
        parseMaybePrivateName();
      }
    } else if (eat2(TokenType3.dot)) {
      state.tokens[state.tokens.length - 1].subscriptStartIndex = startTokenIndex;
      parseMaybePrivateName();
    } else if (eat2(TokenType3.bracketL)) {
      state.tokens[state.tokens.length - 1].subscriptStartIndex = startTokenIndex;
      parseExpression();
      expect(TokenType3.bracketR);
    } else if (!noCalls && match(TokenType3.parenL)) {
      if (atPossibleAsync()) {
        const snapshot = state.snapshot();
        const asyncStartTokenIndex = state.tokens.length;
        next();
        state.tokens[state.tokens.length - 1].subscriptStartIndex = startTokenIndex;
        const callContextId = getNextContextId();
        state.tokens[state.tokens.length - 1].contextId = callContextId;
        parseCallExpressionArguments();
        state.tokens[state.tokens.length - 1].contextId = callContextId;
        if (shouldParseAsyncArrow()) {
          state.restoreFromSnapshot(snapshot);
          stopState.stop = true;
          state.scopeDepth++;
          parseFunctionParams();
          parseAsyncArrowFromCallExpression(asyncStartTokenIndex);
        }
      } else {
        next();
        state.tokens[state.tokens.length - 1].subscriptStartIndex = startTokenIndex;
        const callContextId = getNextContextId();
        state.tokens[state.tokens.length - 1].contextId = callContextId;
        parseCallExpressionArguments();
        state.tokens[state.tokens.length - 1].contextId = callContextId;
      }
    } else if (match(TokenType3.backQuote)) {
      parseTemplate();
    } else {
      stopState.stop = true;
    }
  }
  function atPossibleAsync() {
    return state.tokens[state.tokens.length - 1].contextualKeyword === ContextualKeyword._async && !canInsertSemicolon();
  }
  function parseCallExpressionArguments() {
    let first = true;
    while (!eat2(TokenType3.parenR) && !state.error) {
      if (first) {
        first = false;
      } else {
        expect(TokenType3.comma);
        if (eat2(TokenType3.parenR)) {
          break;
        }
      }
      parseExprListItem(false);
    }
  }
  function shouldParseAsyncArrow() {
    return match(TokenType3.colon) || match(TokenType3.arrow);
  }
  function parseAsyncArrowFromCallExpression(startTokenIndex) {
    if (isTypeScriptEnabled) {
      tsStartParseAsyncArrowFromCallExpression();
    } else if (isFlowEnabled) {
      flowStartParseAsyncArrowFromCallExpression();
    }
    expect(TokenType3.arrow);
    parseArrowExpression(startTokenIndex);
  }
  function parseNoCallExpr() {
    const startTokenIndex = state.tokens.length;
    parseExprAtom();
    parseSubscripts(startTokenIndex, true);
  }
  function parseExprAtom() {
    if (eat2(TokenType3.modulo)) {
      parseIdentifier();
      return false;
    }
    if (match(TokenType3.jsxText) || match(TokenType3.jsxEmptyText)) {
      parseLiteral();
      return false;
    } else if (match(TokenType3.lessThan) && isJSXEnabled) {
      state.type = TokenType3.jsxTagStart;
      jsxParseElement();
      next();
      return false;
    }
    const canBeArrow = state.potentialArrowAt === state.start;
    switch (state.type) {
      case TokenType3.slash:
      case TokenType3.assign:
        retokenizeSlashAsRegex();
      // Fall through.
      case TokenType3._super:
      case TokenType3._this:
      case TokenType3.regexp:
      case TokenType3.num:
      case TokenType3.bigint:
      case TokenType3.decimal:
      case TokenType3.string:
      case TokenType3._null:
      case TokenType3._true:
      case TokenType3._false:
        next();
        return false;
      case TokenType3._import:
        next();
        if (match(TokenType3.dot)) {
          state.tokens[state.tokens.length - 1].type = TokenType3.name;
          next();
          parseIdentifier();
        }
        return false;
      case TokenType3.name: {
        const startTokenIndex = state.tokens.length;
        const functionStart = state.start;
        const contextualKeyword = state.contextualKeyword;
        parseIdentifier();
        if (contextualKeyword === ContextualKeyword._await) {
          parseAwait();
          return false;
        } else if (contextualKeyword === ContextualKeyword._async && match(TokenType3._function) && !canInsertSemicolon()) {
          next();
          parseFunction(functionStart, false);
          return false;
        } else if (canBeArrow && contextualKeyword === ContextualKeyword._async && !canInsertSemicolon() && match(TokenType3.name)) {
          state.scopeDepth++;
          parseBindingIdentifier(false);
          expect(TokenType3.arrow);
          parseArrowExpression(startTokenIndex);
          return true;
        } else if (match(TokenType3._do) && !canInsertSemicolon()) {
          next();
          parseBlock();
          return false;
        }
        if (canBeArrow && !canInsertSemicolon() && match(TokenType3.arrow)) {
          state.scopeDepth++;
          markPriorBindingIdentifier(false);
          expect(TokenType3.arrow);
          parseArrowExpression(startTokenIndex);
          return true;
        }
        state.tokens[state.tokens.length - 1].identifierRole = IdentifierRole.Access;
        return false;
      }
      case TokenType3._do: {
        next();
        parseBlock();
        return false;
      }
      case TokenType3.parenL: {
        const wasArrow = parseParenAndDistinguishExpression(canBeArrow);
        return wasArrow;
      }
      case TokenType3.bracketL:
        next();
        parseExprList(TokenType3.bracketR, true);
        return false;
      case TokenType3.braceL:
        parseObj(false, false);
        return false;
      case TokenType3._function:
        parseFunctionExpression();
        return false;
      case TokenType3.at:
        parseDecorators();
      // Fall through.
      case TokenType3._class:
        parseClass(false);
        return false;
      case TokenType3._new:
        parseNew();
        return false;
      case TokenType3.backQuote:
        parseTemplate();
        return false;
      case TokenType3.doubleColon: {
        next();
        parseNoCallExpr();
        return false;
      }
      case TokenType3.hash: {
        const code = lookaheadCharCode();
        if (IS_IDENTIFIER_START[code] || code === charCodes.backslash) {
          parseMaybePrivateName();
        } else {
          next();
        }
        return false;
      }
      default:
        unexpected();
        return false;
    }
  }
  function parseMaybePrivateName() {
    eat2(TokenType3.hash);
    parseIdentifier();
  }
  function parseFunctionExpression() {
    const functionStart = state.start;
    parseIdentifier();
    if (eat2(TokenType3.dot)) {
      parseIdentifier();
    }
    parseFunction(functionStart, false);
  }
  function parseLiteral() {
    next();
  }
  function parseParenExpression() {
    expect(TokenType3.parenL);
    parseExpression();
    expect(TokenType3.parenR);
  }
  function parseParenAndDistinguishExpression(canBeArrow) {
    const snapshot = state.snapshot();
    const startTokenIndex = state.tokens.length;
    expect(TokenType3.parenL);
    let first = true;
    while (!match(TokenType3.parenR) && !state.error) {
      if (first) {
        first = false;
      } else {
        expect(TokenType3.comma);
        if (match(TokenType3.parenR)) {
          break;
        }
      }
      if (match(TokenType3.ellipsis)) {
        parseRest(
          false
          /* isBlockScope */
        );
        parseParenItem();
        break;
      } else {
        parseMaybeAssign(false, true);
      }
    }
    expect(TokenType3.parenR);
    if (canBeArrow && shouldParseArrow()) {
      const wasArrow = parseArrow();
      if (wasArrow) {
        state.restoreFromSnapshot(snapshot);
        state.scopeDepth++;
        parseFunctionParams();
        parseArrow();
        parseArrowExpression(startTokenIndex);
        if (state.error) {
          state.restoreFromSnapshot(snapshot);
          parseParenAndDistinguishExpression(false);
          return false;
        }
        return true;
      }
    }
    return false;
  }
  function shouldParseArrow() {
    return match(TokenType3.colon) || !canInsertSemicolon();
  }
  function parseArrow() {
    if (isTypeScriptEnabled) {
      return tsParseArrow();
    } else if (isFlowEnabled) {
      return flowParseArrow();
    } else {
      return eat2(TokenType3.arrow);
    }
  }
  function parseParenItem() {
    if (isTypeScriptEnabled || isFlowEnabled) {
      typedParseParenItem();
    }
  }
  function parseNew() {
    expect(TokenType3._new);
    if (eat2(TokenType3.dot)) {
      parseIdentifier();
      return;
    }
    parseNewCallee();
    if (isFlowEnabled) {
      flowStartParseNewArguments();
    }
    if (eat2(TokenType3.parenL)) {
      parseExprList(TokenType3.parenR);
    }
  }
  function parseNewCallee() {
    parseNoCallExpr();
    eat2(TokenType3.questionDot);
  }
  function parseTemplate() {
    nextTemplateToken();
    nextTemplateToken();
    while (!match(TokenType3.backQuote) && !state.error) {
      expect(TokenType3.dollarBraceL);
      parseExpression();
      nextTemplateToken();
      nextTemplateToken();
    }
    next();
  }
  function parseObj(isPattern, isBlockScope) {
    const contextId = getNextContextId();
    let first = true;
    next();
    state.tokens[state.tokens.length - 1].contextId = contextId;
    while (!eat2(TokenType3.braceR) && !state.error) {
      if (first) {
        first = false;
      } else {
        expect(TokenType3.comma);
        if (eat2(TokenType3.braceR)) {
          break;
        }
      }
      let isGenerator = false;
      if (match(TokenType3.ellipsis)) {
        const previousIndex = state.tokens.length;
        parseSpread();
        if (isPattern) {
          if (state.tokens.length === previousIndex + 2) {
            markPriorBindingIdentifier(isBlockScope);
          }
          if (eat2(TokenType3.braceR)) {
            break;
          }
        }
        continue;
      }
      if (!isPattern) {
        isGenerator = eat2(TokenType3.star);
      }
      if (!isPattern && isContextual(ContextualKeyword._async)) {
        if (isGenerator) unexpected();
        parseIdentifier();
        if (match(TokenType3.colon) || match(TokenType3.parenL) || match(TokenType3.braceR) || match(TokenType3.eq) || match(TokenType3.comma)) {
        } else {
          if (match(TokenType3.star)) {
            next();
            isGenerator = true;
          }
          parsePropertyName(contextId);
        }
      } else {
        parsePropertyName(contextId);
      }
      parseObjPropValue(isPattern, isBlockScope, contextId);
    }
    state.tokens[state.tokens.length - 1].contextId = contextId;
  }
  function isGetterOrSetterMethod(isPattern) {
    return !isPattern && (match(TokenType3.string) || // get "string"() {}
    match(TokenType3.num) || // get 1() {}
    match(TokenType3.bracketL) || // get ["string"]() {}
    match(TokenType3.name) || // get foo() {}
    !!(state.type & TokenType3.IS_KEYWORD));
  }
  function parseObjectMethod(isPattern, objectContextId) {
    const functionStart = state.start;
    if (match(TokenType3.parenL)) {
      if (isPattern) unexpected();
      parseMethod(
        functionStart,
        /* isConstructor */
        false
      );
      return true;
    }
    if (isGetterOrSetterMethod(isPattern)) {
      parsePropertyName(objectContextId);
      parseMethod(
        functionStart,
        /* isConstructor */
        false
      );
      return true;
    }
    return false;
  }
  function parseObjectProperty(isPattern, isBlockScope) {
    if (eat2(TokenType3.colon)) {
      if (isPattern) {
        parseMaybeDefault(isBlockScope);
      } else {
        parseMaybeAssign(false);
      }
      return;
    }
    let identifierRole;
    if (isPattern) {
      if (state.scopeDepth === 0) {
        identifierRole = IdentifierRole.ObjectShorthandTopLevelDeclaration;
      } else if (isBlockScope) {
        identifierRole = IdentifierRole.ObjectShorthandBlockScopedDeclaration;
      } else {
        identifierRole = IdentifierRole.ObjectShorthandFunctionScopedDeclaration;
      }
    } else {
      identifierRole = IdentifierRole.ObjectShorthand;
    }
    state.tokens[state.tokens.length - 1].identifierRole = identifierRole;
    parseMaybeDefault(isBlockScope, true);
  }
  function parseObjPropValue(isPattern, isBlockScope, objectContextId) {
    if (isTypeScriptEnabled) {
      tsStartParseObjPropValue();
    } else if (isFlowEnabled) {
      flowStartParseObjPropValue();
    }
    const wasMethod = parseObjectMethod(isPattern, objectContextId);
    if (!wasMethod) {
      parseObjectProperty(isPattern, isBlockScope);
    }
  }
  function parsePropertyName(objectContextId) {
    if (isFlowEnabled) {
      flowParseVariance();
    }
    if (eat2(TokenType3.bracketL)) {
      state.tokens[state.tokens.length - 1].contextId = objectContextId;
      parseMaybeAssign();
      expect(TokenType3.bracketR);
      state.tokens[state.tokens.length - 1].contextId = objectContextId;
    } else {
      if (match(TokenType3.num) || match(TokenType3.string) || match(TokenType3.bigint) || match(TokenType3.decimal)) {
        parseExprAtom();
      } else {
        parseMaybePrivateName();
      }
      state.tokens[state.tokens.length - 1].identifierRole = IdentifierRole.ObjectKey;
      state.tokens[state.tokens.length - 1].contextId = objectContextId;
    }
  }
  function parseMethod(functionStart, isConstructor) {
    const funcContextId = getNextContextId();
    state.scopeDepth++;
    const startTokenIndex = state.tokens.length;
    const allowModifiers = isConstructor;
    parseFunctionParams(allowModifiers, funcContextId);
    parseFunctionBodyAndFinish(functionStart, funcContextId);
    const endTokenIndex = state.tokens.length;
    state.scopes.push(new Scope3(startTokenIndex, endTokenIndex, true));
    state.scopeDepth--;
  }
  function parseArrowExpression(startTokenIndex) {
    parseFunctionBody(true);
    const endTokenIndex = state.tokens.length;
    state.scopes.push(new Scope3(startTokenIndex, endTokenIndex, true));
    state.scopeDepth--;
  }
  function parseFunctionBodyAndFinish(functionStart, funcContextId = 0) {
    if (isTypeScriptEnabled) {
      tsParseFunctionBodyAndFinish(functionStart, funcContextId);
    } else if (isFlowEnabled) {
      flowParseFunctionBodyAndFinish(funcContextId);
    } else {
      parseFunctionBody(false, funcContextId);
    }
  }
  function parseFunctionBody(allowExpression, funcContextId = 0) {
    const isExpression = allowExpression && !match(TokenType3.braceL);
    if (isExpression) {
      parseMaybeAssign();
    } else {
      parseBlock(true, funcContextId);
    }
  }
  function parseExprList(close, allowEmpty = false) {
    let first = true;
    while (!eat2(close) && !state.error) {
      if (first) {
        first = false;
      } else {
        expect(TokenType3.comma);
        if (eat2(close)) break;
      }
      parseExprListItem(allowEmpty);
    }
  }
  function parseExprListItem(allowEmpty) {
    if (allowEmpty && match(TokenType3.comma)) {
    } else if (match(TokenType3.ellipsis)) {
      parseSpread();
      parseParenItem();
    } else if (match(TokenType3.question)) {
      next();
    } else {
      parseMaybeAssign(false, true);
    }
  }
  function parseIdentifier() {
    next();
    state.tokens[state.tokens.length - 1].type = TokenType3.name;
  }
  function parseAwait() {
    parseMaybeUnary();
  }
  function parseYield() {
    next();
    if (!match(TokenType3.semi) && !canInsertSemicolon()) {
      eat2(TokenType3.star);
      parseMaybeAssign();
    }
  }
  function parseModuleExpression() {
    expectContextual(ContextualKeyword._module);
    expect(TokenType3.braceL);
    parseBlockBody(TokenType3.braceR);
  }

  // node_modules/sucrase/dist/esm/parser/plugins/flow.js
  function isMaybeDefaultImport(lookahead2) {
    return (lookahead2.type === TokenType3.name || !!(lookahead2.type & TokenType3.IS_KEYWORD)) && lookahead2.contextualKeyword !== ContextualKeyword._from;
  }
  function flowParseTypeInitialiser(tok) {
    const oldIsType = pushTypeContext(0);
    expect(tok || TokenType3.colon);
    flowParseType();
    popTypeContext(oldIsType);
  }
  function flowParsePredicate() {
    expect(TokenType3.modulo);
    expectContextual(ContextualKeyword._checks);
    if (eat2(TokenType3.parenL)) {
      parseExpression();
      expect(TokenType3.parenR);
    }
  }
  function flowParseTypeAndPredicateInitialiser() {
    const oldIsType = pushTypeContext(0);
    expect(TokenType3.colon);
    if (match(TokenType3.modulo)) {
      flowParsePredicate();
    } else {
      flowParseType();
      if (match(TokenType3.modulo)) {
        flowParsePredicate();
      }
    }
    popTypeContext(oldIsType);
  }
  function flowParseDeclareClass() {
    next();
    flowParseInterfaceish(
      /* isClass */
      true
    );
  }
  function flowParseDeclareFunction() {
    next();
    parseIdentifier();
    if (match(TokenType3.lessThan)) {
      flowParseTypeParameterDeclaration();
    }
    expect(TokenType3.parenL);
    flowParseFunctionTypeParams();
    expect(TokenType3.parenR);
    flowParseTypeAndPredicateInitialiser();
    semicolon();
  }
  function flowParseDeclare() {
    if (match(TokenType3._class)) {
      flowParseDeclareClass();
    } else if (match(TokenType3._function)) {
      flowParseDeclareFunction();
    } else if (match(TokenType3._var)) {
      flowParseDeclareVariable();
    } else if (eatContextual(ContextualKeyword._module)) {
      if (eat2(TokenType3.dot)) {
        flowParseDeclareModuleExports();
      } else {
        flowParseDeclareModule();
      }
    } else if (isContextual(ContextualKeyword._type)) {
      flowParseDeclareTypeAlias();
    } else if (isContextual(ContextualKeyword._opaque)) {
      flowParseDeclareOpaqueType();
    } else if (isContextual(ContextualKeyword._interface)) {
      flowParseDeclareInterface();
    } else if (match(TokenType3._export)) {
      flowParseDeclareExportDeclaration();
    } else {
      unexpected();
    }
  }
  function flowParseDeclareVariable() {
    next();
    flowParseTypeAnnotatableIdentifier();
    semicolon();
  }
  function flowParseDeclareModule() {
    if (match(TokenType3.string)) {
      parseExprAtom();
    } else {
      parseIdentifier();
    }
    expect(TokenType3.braceL);
    while (!match(TokenType3.braceR) && !state.error) {
      if (match(TokenType3._import)) {
        next();
        parseImport();
      } else {
        unexpected();
      }
    }
    expect(TokenType3.braceR);
  }
  function flowParseDeclareExportDeclaration() {
    expect(TokenType3._export);
    if (eat2(TokenType3._default)) {
      if (match(TokenType3._function) || match(TokenType3._class)) {
        flowParseDeclare();
      } else {
        flowParseType();
        semicolon();
      }
    } else if (match(TokenType3._var) || // declare export var ...
    match(TokenType3._function) || // declare export function ...
    match(TokenType3._class) || // declare export class ...
    isContextual(ContextualKeyword._opaque)) {
      flowParseDeclare();
    } else if (match(TokenType3.star) || // declare export * from ''
    match(TokenType3.braceL) || // declare export {} ...
    isContextual(ContextualKeyword._interface) || // declare export interface ...
    isContextual(ContextualKeyword._type) || // declare export type ...
    isContextual(ContextualKeyword._opaque)) {
      parseExport();
    } else {
      unexpected();
    }
  }
  function flowParseDeclareModuleExports() {
    expectContextual(ContextualKeyword._exports);
    flowParseTypeAnnotation();
    semicolon();
  }
  function flowParseDeclareTypeAlias() {
    next();
    flowParseTypeAlias();
  }
  function flowParseDeclareOpaqueType() {
    next();
    flowParseOpaqueType(true);
  }
  function flowParseDeclareInterface() {
    next();
    flowParseInterfaceish();
  }
  function flowParseInterfaceish(isClass = false) {
    flowParseRestrictedIdentifier();
    if (match(TokenType3.lessThan)) {
      flowParseTypeParameterDeclaration();
    }
    if (eat2(TokenType3._extends)) {
      do {
        flowParseInterfaceExtends();
      } while (!isClass && eat2(TokenType3.comma));
    }
    if (isContextual(ContextualKeyword._mixins)) {
      next();
      do {
        flowParseInterfaceExtends();
      } while (eat2(TokenType3.comma));
    }
    if (isContextual(ContextualKeyword._implements)) {
      next();
      do {
        flowParseInterfaceExtends();
      } while (eat2(TokenType3.comma));
    }
    flowParseObjectType(isClass, false, isClass);
  }
  function flowParseInterfaceExtends() {
    flowParseQualifiedTypeIdentifier(false);
    if (match(TokenType3.lessThan)) {
      flowParseTypeParameterInstantiation();
    }
  }
  function flowParseInterface() {
    flowParseInterfaceish();
  }
  function flowParseRestrictedIdentifier() {
    parseIdentifier();
  }
  function flowParseTypeAlias() {
    flowParseRestrictedIdentifier();
    if (match(TokenType3.lessThan)) {
      flowParseTypeParameterDeclaration();
    }
    flowParseTypeInitialiser(TokenType3.eq);
    semicolon();
  }
  function flowParseOpaqueType(declare) {
    expectContextual(ContextualKeyword._type);
    flowParseRestrictedIdentifier();
    if (match(TokenType3.lessThan)) {
      flowParseTypeParameterDeclaration();
    }
    if (match(TokenType3.colon)) {
      flowParseTypeInitialiser(TokenType3.colon);
    }
    if (!declare) {
      flowParseTypeInitialiser(TokenType3.eq);
    }
    semicolon();
  }
  function flowParseTypeParameter() {
    flowParseVariance();
    flowParseTypeAnnotatableIdentifier();
    if (eat2(TokenType3.eq)) {
      flowParseType();
    }
  }
  function flowParseTypeParameterDeclaration() {
    const oldIsType = pushTypeContext(0);
    if (match(TokenType3.lessThan) || match(TokenType3.typeParameterStart)) {
      next();
    } else {
      unexpected();
    }
    do {
      flowParseTypeParameter();
      if (!match(TokenType3.greaterThan)) {
        expect(TokenType3.comma);
      }
    } while (!match(TokenType3.greaterThan) && !state.error);
    expect(TokenType3.greaterThan);
    popTypeContext(oldIsType);
  }
  function flowParseTypeParameterInstantiation() {
    const oldIsType = pushTypeContext(0);
    expect(TokenType3.lessThan);
    while (!match(TokenType3.greaterThan) && !state.error) {
      flowParseType();
      if (!match(TokenType3.greaterThan)) {
        expect(TokenType3.comma);
      }
    }
    expect(TokenType3.greaterThan);
    popTypeContext(oldIsType);
  }
  function flowParseInterfaceType() {
    expectContextual(ContextualKeyword._interface);
    if (eat2(TokenType3._extends)) {
      do {
        flowParseInterfaceExtends();
      } while (eat2(TokenType3.comma));
    }
    flowParseObjectType(false, false, false);
  }
  function flowParseObjectPropertyKey() {
    if (match(TokenType3.num) || match(TokenType3.string)) {
      parseExprAtom();
    } else {
      parseIdentifier();
    }
  }
  function flowParseObjectTypeIndexer() {
    if (lookaheadType() === TokenType3.colon) {
      flowParseObjectPropertyKey();
      flowParseTypeInitialiser();
    } else {
      flowParseType();
    }
    expect(TokenType3.bracketR);
    flowParseTypeInitialiser();
  }
  function flowParseObjectTypeInternalSlot() {
    flowParseObjectPropertyKey();
    expect(TokenType3.bracketR);
    expect(TokenType3.bracketR);
    if (match(TokenType3.lessThan) || match(TokenType3.parenL)) {
      flowParseObjectTypeMethodish();
    } else {
      eat2(TokenType3.question);
      flowParseTypeInitialiser();
    }
  }
  function flowParseObjectTypeMethodish() {
    if (match(TokenType3.lessThan)) {
      flowParseTypeParameterDeclaration();
    }
    expect(TokenType3.parenL);
    while (!match(TokenType3.parenR) && !match(TokenType3.ellipsis) && !state.error) {
      flowParseFunctionTypeParam();
      if (!match(TokenType3.parenR)) {
        expect(TokenType3.comma);
      }
    }
    if (eat2(TokenType3.ellipsis)) {
      flowParseFunctionTypeParam();
    }
    expect(TokenType3.parenR);
    flowParseTypeInitialiser();
  }
  function flowParseObjectTypeCallProperty() {
    flowParseObjectTypeMethodish();
  }
  function flowParseObjectType(allowStatic, allowExact, allowProto) {
    let endDelim;
    if (allowExact && match(TokenType3.braceBarL)) {
      expect(TokenType3.braceBarL);
      endDelim = TokenType3.braceBarR;
    } else {
      expect(TokenType3.braceL);
      endDelim = TokenType3.braceR;
    }
    while (!match(endDelim) && !state.error) {
      if (allowProto && isContextual(ContextualKeyword._proto)) {
        const lookahead2 = lookaheadType();
        if (lookahead2 !== TokenType3.colon && lookahead2 !== TokenType3.question) {
          next();
          allowStatic = false;
        }
      }
      if (allowStatic && isContextual(ContextualKeyword._static)) {
        const lookahead2 = lookaheadType();
        if (lookahead2 !== TokenType3.colon && lookahead2 !== TokenType3.question) {
          next();
        }
      }
      flowParseVariance();
      if (eat2(TokenType3.bracketL)) {
        if (eat2(TokenType3.bracketL)) {
          flowParseObjectTypeInternalSlot();
        } else {
          flowParseObjectTypeIndexer();
        }
      } else if (match(TokenType3.parenL) || match(TokenType3.lessThan)) {
        flowParseObjectTypeCallProperty();
      } else {
        if (isContextual(ContextualKeyword._get) || isContextual(ContextualKeyword._set)) {
          const lookahead2 = lookaheadType();
          if (lookahead2 === TokenType3.name || lookahead2 === TokenType3.string || lookahead2 === TokenType3.num) {
            next();
          }
        }
        flowParseObjectTypeProperty();
      }
      flowObjectTypeSemicolon();
    }
    expect(endDelim);
  }
  function flowParseObjectTypeProperty() {
    if (match(TokenType3.ellipsis)) {
      expect(TokenType3.ellipsis);
      if (!eat2(TokenType3.comma)) {
        eat2(TokenType3.semi);
      }
      if (match(TokenType3.braceR)) {
        return;
      }
      flowParseType();
    } else {
      flowParseObjectPropertyKey();
      if (match(TokenType3.lessThan) || match(TokenType3.parenL)) {
        flowParseObjectTypeMethodish();
      } else {
        eat2(TokenType3.question);
        flowParseTypeInitialiser();
      }
    }
  }
  function flowObjectTypeSemicolon() {
    if (!eat2(TokenType3.semi) && !eat2(TokenType3.comma) && !match(TokenType3.braceR) && !match(TokenType3.braceBarR)) {
      unexpected();
    }
  }
  function flowParseQualifiedTypeIdentifier(initialIdAlreadyParsed) {
    if (!initialIdAlreadyParsed) {
      parseIdentifier();
    }
    while (eat2(TokenType3.dot)) {
      parseIdentifier();
    }
  }
  function flowParseGenericType() {
    flowParseQualifiedTypeIdentifier(true);
    if (match(TokenType3.lessThan)) {
      flowParseTypeParameterInstantiation();
    }
  }
  function flowParseTypeofType() {
    expect(TokenType3._typeof);
    flowParsePrimaryType();
  }
  function flowParseTupleType() {
    expect(TokenType3.bracketL);
    while (state.pos < input.length && !match(TokenType3.bracketR)) {
      flowParseType();
      if (match(TokenType3.bracketR)) {
        break;
      }
      expect(TokenType3.comma);
    }
    expect(TokenType3.bracketR);
  }
  function flowParseFunctionTypeParam() {
    const lookahead2 = lookaheadType();
    if (lookahead2 === TokenType3.colon || lookahead2 === TokenType3.question) {
      parseIdentifier();
      eat2(TokenType3.question);
      flowParseTypeInitialiser();
    } else {
      flowParseType();
    }
  }
  function flowParseFunctionTypeParams() {
    while (!match(TokenType3.parenR) && !match(TokenType3.ellipsis) && !state.error) {
      flowParseFunctionTypeParam();
      if (!match(TokenType3.parenR)) {
        expect(TokenType3.comma);
      }
    }
    if (eat2(TokenType3.ellipsis)) {
      flowParseFunctionTypeParam();
    }
  }
  function flowParsePrimaryType() {
    let isGroupedType = false;
    const oldNoAnonFunctionType = state.noAnonFunctionType;
    switch (state.type) {
      case TokenType3.name: {
        if (isContextual(ContextualKeyword._interface)) {
          flowParseInterfaceType();
          return;
        }
        parseIdentifier();
        flowParseGenericType();
        return;
      }
      case TokenType3.braceL:
        flowParseObjectType(false, false, false);
        return;
      case TokenType3.braceBarL:
        flowParseObjectType(false, true, false);
        return;
      case TokenType3.bracketL:
        flowParseTupleType();
        return;
      case TokenType3.lessThan:
        flowParseTypeParameterDeclaration();
        expect(TokenType3.parenL);
        flowParseFunctionTypeParams();
        expect(TokenType3.parenR);
        expect(TokenType3.arrow);
        flowParseType();
        return;
      case TokenType3.parenL:
        next();
        if (!match(TokenType3.parenR) && !match(TokenType3.ellipsis)) {
          if (match(TokenType3.name)) {
            const token = lookaheadType();
            isGroupedType = token !== TokenType3.question && token !== TokenType3.colon;
          } else {
            isGroupedType = true;
          }
        }
        if (isGroupedType) {
          state.noAnonFunctionType = false;
          flowParseType();
          state.noAnonFunctionType = oldNoAnonFunctionType;
          if (state.noAnonFunctionType || !(match(TokenType3.comma) || match(TokenType3.parenR) && lookaheadType() === TokenType3.arrow)) {
            expect(TokenType3.parenR);
            return;
          } else {
            eat2(TokenType3.comma);
          }
        }
        flowParseFunctionTypeParams();
        expect(TokenType3.parenR);
        expect(TokenType3.arrow);
        flowParseType();
        return;
      case TokenType3.minus:
        next();
        parseLiteral();
        return;
      case TokenType3.string:
      case TokenType3.num:
      case TokenType3._true:
      case TokenType3._false:
      case TokenType3._null:
      case TokenType3._this:
      case TokenType3._void:
      case TokenType3.star:
        next();
        return;
      default:
        if (state.type === TokenType3._typeof) {
          flowParseTypeofType();
          return;
        } else if (state.type & TokenType3.IS_KEYWORD) {
          next();
          state.tokens[state.tokens.length - 1].type = TokenType3.name;
          return;
        }
    }
    unexpected();
  }
  function flowParsePostfixType() {
    flowParsePrimaryType();
    while (!canInsertSemicolon() && (match(TokenType3.bracketL) || match(TokenType3.questionDot))) {
      eat2(TokenType3.questionDot);
      expect(TokenType3.bracketL);
      if (eat2(TokenType3.bracketR)) {
      } else {
        flowParseType();
        expect(TokenType3.bracketR);
      }
    }
  }
  function flowParsePrefixType() {
    if (eat2(TokenType3.question)) {
      flowParsePrefixType();
    } else {
      flowParsePostfixType();
    }
  }
  function flowParseAnonFunctionWithoutParens() {
    flowParsePrefixType();
    if (!state.noAnonFunctionType && eat2(TokenType3.arrow)) {
      flowParseType();
    }
  }
  function flowParseIntersectionType() {
    eat2(TokenType3.bitwiseAND);
    flowParseAnonFunctionWithoutParens();
    while (eat2(TokenType3.bitwiseAND)) {
      flowParseAnonFunctionWithoutParens();
    }
  }
  function flowParseUnionType() {
    eat2(TokenType3.bitwiseOR);
    flowParseIntersectionType();
    while (eat2(TokenType3.bitwiseOR)) {
      flowParseIntersectionType();
    }
  }
  function flowParseType() {
    flowParseUnionType();
  }
  function flowParseTypeAnnotation() {
    flowParseTypeInitialiser();
  }
  function flowParseTypeAnnotatableIdentifier() {
    parseIdentifier();
    if (match(TokenType3.colon)) {
      flowParseTypeAnnotation();
    }
  }
  function flowParseVariance() {
    if (match(TokenType3.plus) || match(TokenType3.minus)) {
      next();
      state.tokens[state.tokens.length - 1].isType = true;
    }
  }
  function flowParseFunctionBodyAndFinish(funcContextId) {
    if (match(TokenType3.colon)) {
      flowParseTypeAndPredicateInitialiser();
    }
    parseFunctionBody(false, funcContextId);
  }
  function flowParseSubscript(startTokenIndex, noCalls, stopState) {
    if (match(TokenType3.questionDot) && lookaheadType() === TokenType3.lessThan) {
      if (noCalls) {
        stopState.stop = true;
        return;
      }
      next();
      flowParseTypeParameterInstantiation();
      expect(TokenType3.parenL);
      parseCallExpressionArguments();
      return;
    } else if (!noCalls && match(TokenType3.lessThan)) {
      const snapshot = state.snapshot();
      flowParseTypeParameterInstantiation();
      expect(TokenType3.parenL);
      parseCallExpressionArguments();
      if (state.error) {
        state.restoreFromSnapshot(snapshot);
      } else {
        return;
      }
    }
    baseParseSubscript(startTokenIndex, noCalls, stopState);
  }
  function flowStartParseNewArguments() {
    if (match(TokenType3.lessThan)) {
      const snapshot = state.snapshot();
      flowParseTypeParameterInstantiation();
      if (state.error) {
        state.restoreFromSnapshot(snapshot);
      }
    }
  }
  function flowTryParseStatement() {
    if (match(TokenType3.name) && state.contextualKeyword === ContextualKeyword._interface) {
      const oldIsType = pushTypeContext(0);
      next();
      flowParseInterface();
      popTypeContext(oldIsType);
      return true;
    } else if (isContextual(ContextualKeyword._enum)) {
      flowParseEnumDeclaration();
      return true;
    }
    return false;
  }
  function flowTryParseExportDefaultExpression() {
    if (isContextual(ContextualKeyword._enum)) {
      flowParseEnumDeclaration();
      return true;
    }
    return false;
  }
  function flowParseIdentifierStatement(contextualKeyword) {
    if (contextualKeyword === ContextualKeyword._declare) {
      if (match(TokenType3._class) || match(TokenType3.name) || match(TokenType3._function) || match(TokenType3._var) || match(TokenType3._export)) {
        const oldIsType = pushTypeContext(1);
        flowParseDeclare();
        popTypeContext(oldIsType);
      }
    } else if (match(TokenType3.name)) {
      if (contextualKeyword === ContextualKeyword._interface) {
        const oldIsType = pushTypeContext(1);
        flowParseInterface();
        popTypeContext(oldIsType);
      } else if (contextualKeyword === ContextualKeyword._type) {
        const oldIsType = pushTypeContext(1);
        flowParseTypeAlias();
        popTypeContext(oldIsType);
      } else if (contextualKeyword === ContextualKeyword._opaque) {
        const oldIsType = pushTypeContext(1);
        flowParseOpaqueType(false);
        popTypeContext(oldIsType);
      }
    }
    semicolon();
  }
  function flowShouldParseExportDeclaration() {
    return isContextual(ContextualKeyword._type) || isContextual(ContextualKeyword._interface) || isContextual(ContextualKeyword._opaque) || isContextual(ContextualKeyword._enum);
  }
  function flowShouldDisallowExportDefaultSpecifier() {
    return match(TokenType3.name) && (state.contextualKeyword === ContextualKeyword._type || state.contextualKeyword === ContextualKeyword._interface || state.contextualKeyword === ContextualKeyword._opaque || state.contextualKeyword === ContextualKeyword._enum);
  }
  function flowParseExportDeclaration() {
    if (isContextual(ContextualKeyword._type)) {
      const oldIsType = pushTypeContext(1);
      next();
      if (match(TokenType3.braceL)) {
        parseExportSpecifiers();
        parseExportFrom();
      } else {
        flowParseTypeAlias();
      }
      popTypeContext(oldIsType);
    } else if (isContextual(ContextualKeyword._opaque)) {
      const oldIsType = pushTypeContext(1);
      next();
      flowParseOpaqueType(false);
      popTypeContext(oldIsType);
    } else if (isContextual(ContextualKeyword._interface)) {
      const oldIsType = pushTypeContext(1);
      next();
      flowParseInterface();
      popTypeContext(oldIsType);
    } else {
      parseStatement(true);
    }
  }
  function flowShouldParseExportStar() {
    return match(TokenType3.star) || isContextual(ContextualKeyword._type) && lookaheadType() === TokenType3.star;
  }
  function flowParseExportStar() {
    if (eatContextual(ContextualKeyword._type)) {
      const oldIsType = pushTypeContext(2);
      baseParseExportStar();
      popTypeContext(oldIsType);
    } else {
      baseParseExportStar();
    }
  }
  function flowAfterParseClassSuper(hasSuper) {
    if (hasSuper && match(TokenType3.lessThan)) {
      flowParseTypeParameterInstantiation();
    }
    if (isContextual(ContextualKeyword._implements)) {
      const oldIsType = pushTypeContext(0);
      next();
      state.tokens[state.tokens.length - 1].type = TokenType3._implements;
      do {
        flowParseRestrictedIdentifier();
        if (match(TokenType3.lessThan)) {
          flowParseTypeParameterInstantiation();
        }
      } while (eat2(TokenType3.comma));
      popTypeContext(oldIsType);
    }
  }
  function flowStartParseObjPropValue() {
    if (match(TokenType3.lessThan)) {
      flowParseTypeParameterDeclaration();
      if (!match(TokenType3.parenL)) unexpected();
    }
  }
  function flowParseAssignableListItemTypes() {
    const oldIsType = pushTypeContext(0);
    eat2(TokenType3.question);
    if (match(TokenType3.colon)) {
      flowParseTypeAnnotation();
    }
    popTypeContext(oldIsType);
  }
  function flowStartParseImportSpecifiers() {
    if (match(TokenType3._typeof) || isContextual(ContextualKeyword._type)) {
      const lh = lookaheadTypeAndKeyword();
      if (isMaybeDefaultImport(lh) || lh.type === TokenType3.braceL || lh.type === TokenType3.star) {
        next();
      }
    }
  }
  function flowParseImportSpecifier() {
    const isTypeKeyword = state.contextualKeyword === ContextualKeyword._type || state.type === TokenType3._typeof;
    if (isTypeKeyword) {
      next();
    } else {
      parseIdentifier();
    }
    if (isContextual(ContextualKeyword._as) && !isLookaheadContextual(ContextualKeyword._as)) {
      parseIdentifier();
      if (isTypeKeyword && !match(TokenType3.name) && !(state.type & TokenType3.IS_KEYWORD)) {
      } else {
        parseIdentifier();
      }
    } else {
      if (isTypeKeyword && (match(TokenType3.name) || !!(state.type & TokenType3.IS_KEYWORD))) {
        parseIdentifier();
      }
      if (eatContextual(ContextualKeyword._as)) {
        parseIdentifier();
      }
    }
  }
  function flowStartParseFunctionParams() {
    if (match(TokenType3.lessThan)) {
      const oldIsType = pushTypeContext(0);
      flowParseTypeParameterDeclaration();
      popTypeContext(oldIsType);
    }
  }
  function flowAfterParseVarHead() {
    if (match(TokenType3.colon)) {
      flowParseTypeAnnotation();
    }
  }
  function flowStartParseAsyncArrowFromCallExpression() {
    if (match(TokenType3.colon)) {
      const oldNoAnonFunctionType = state.noAnonFunctionType;
      state.noAnonFunctionType = true;
      flowParseTypeAnnotation();
      state.noAnonFunctionType = oldNoAnonFunctionType;
    }
  }
  function flowParseMaybeAssign(noIn, isWithinParens) {
    if (match(TokenType3.lessThan)) {
      const snapshot = state.snapshot();
      let wasArrow = baseParseMaybeAssign(noIn, isWithinParens);
      if (state.error) {
        state.restoreFromSnapshot(snapshot);
        state.type = TokenType3.typeParameterStart;
      } else {
        return wasArrow;
      }
      const oldIsType = pushTypeContext(0);
      flowParseTypeParameterDeclaration();
      popTypeContext(oldIsType);
      wasArrow = baseParseMaybeAssign(noIn, isWithinParens);
      if (wasArrow) {
        return true;
      }
      unexpected();
    }
    return baseParseMaybeAssign(noIn, isWithinParens);
  }
  function flowParseArrow() {
    if (match(TokenType3.colon)) {
      const oldIsType = pushTypeContext(0);
      const snapshot = state.snapshot();
      const oldNoAnonFunctionType = state.noAnonFunctionType;
      state.noAnonFunctionType = true;
      flowParseTypeAndPredicateInitialiser();
      state.noAnonFunctionType = oldNoAnonFunctionType;
      if (canInsertSemicolon()) unexpected();
      if (!match(TokenType3.arrow)) unexpected();
      if (state.error) {
        state.restoreFromSnapshot(snapshot);
      }
      popTypeContext(oldIsType);
    }
    return eat2(TokenType3.arrow);
  }
  function flowParseSubscripts(startTokenIndex, noCalls = false) {
    if (state.tokens[state.tokens.length - 1].contextualKeyword === ContextualKeyword._async && match(TokenType3.lessThan)) {
      const snapshot = state.snapshot();
      const wasArrow = parseAsyncArrowWithTypeParameters();
      if (wasArrow && !state.error) {
        return;
      }
      state.restoreFromSnapshot(snapshot);
    }
    baseParseSubscripts(startTokenIndex, noCalls);
  }
  function parseAsyncArrowWithTypeParameters() {
    state.scopeDepth++;
    const startTokenIndex = state.tokens.length;
    parseFunctionParams();
    if (!parseArrow()) {
      return false;
    }
    parseArrowExpression(startTokenIndex);
    return true;
  }
  function flowParseEnumDeclaration() {
    expectContextual(ContextualKeyword._enum);
    state.tokens[state.tokens.length - 1].type = TokenType3._enum;
    parseIdentifier();
    flowParseEnumBody();
  }
  function flowParseEnumBody() {
    if (eatContextual(ContextualKeyword._of)) {
      next();
    }
    expect(TokenType3.braceL);
    flowParseEnumMembers();
    expect(TokenType3.braceR);
  }
  function flowParseEnumMembers() {
    while (!match(TokenType3.braceR) && !state.error) {
      if (eat2(TokenType3.ellipsis)) {
        break;
      }
      flowParseEnumMember();
      if (!match(TokenType3.braceR)) {
        expect(TokenType3.comma);
      }
    }
  }
  function flowParseEnumMember() {
    parseIdentifier();
    if (eat2(TokenType3.eq)) {
      next();
    }
  }

  // node_modules/sucrase/dist/esm/parser/traverser/statement.js
  function parseTopLevel() {
    parseBlockBody(TokenType3.eof);
    state.scopes.push(new Scope3(0, state.tokens.length, true));
    if (state.scopeDepth !== 0) {
      throw new Error(`Invalid scope depth at end of file: ${state.scopeDepth}`);
    }
    return new File(state.tokens, state.scopes);
  }
  function parseStatement(declaration) {
    if (isFlowEnabled) {
      if (flowTryParseStatement()) {
        return;
      }
    }
    if (match(TokenType3.at)) {
      parseDecorators();
    }
    parseStatementContent(declaration);
  }
  function parseStatementContent(declaration) {
    if (isTypeScriptEnabled) {
      if (tsTryParseStatementContent()) {
        return;
      }
    }
    const starttype = state.type;
    switch (starttype) {
      case TokenType3._break:
      case TokenType3._continue:
        parseBreakContinueStatement();
        return;
      case TokenType3._debugger:
        parseDebuggerStatement();
        return;
      case TokenType3._do:
        parseDoStatement();
        return;
      case TokenType3._for:
        parseForStatement();
        return;
      case TokenType3._function:
        if (lookaheadType() === TokenType3.dot) break;
        if (!declaration) unexpected();
        parseFunctionStatement();
        return;
      case TokenType3._class:
        if (!declaration) unexpected();
        parseClass(true);
        return;
      case TokenType3._if:
        parseIfStatement();
        return;
      case TokenType3._return:
        parseReturnStatement();
        return;
      case TokenType3._switch:
        parseSwitchStatement();
        return;
      case TokenType3._throw:
        parseThrowStatement();
        return;
      case TokenType3._try:
        parseTryStatement();
        return;
      case TokenType3._let:
      case TokenType3._const:
        if (!declaration) unexpected();
      // NOTE: falls through to _var
      case TokenType3._var:
        parseVarStatement(starttype !== TokenType3._var);
        return;
      case TokenType3._while:
        parseWhileStatement();
        return;
      case TokenType3.braceL:
        parseBlock();
        return;
      case TokenType3.semi:
        parseEmptyStatement();
        return;
      case TokenType3._export:
      case TokenType3._import: {
        const nextType = lookaheadType();
        if (nextType === TokenType3.parenL || nextType === TokenType3.dot) {
          break;
        }
        next();
        if (starttype === TokenType3._import) {
          parseImport();
        } else {
          parseExport();
        }
        return;
      }
      case TokenType3.name:
        if (state.contextualKeyword === ContextualKeyword._async) {
          const functionStart = state.start;
          const snapshot = state.snapshot();
          next();
          if (match(TokenType3._function) && !canInsertSemicolon()) {
            expect(TokenType3._function);
            parseFunction(functionStart, true);
            return;
          } else {
            state.restoreFromSnapshot(snapshot);
          }
        } else if (state.contextualKeyword === ContextualKeyword._using && !hasFollowingLineBreak() && // Statements like `using[0]` and `using in foo` aren't actual using
        // declarations.
        lookaheadType() === TokenType3.name) {
          parseVarStatement(true);
          return;
        } else if (startsAwaitUsing()) {
          expectContextual(ContextualKeyword._await);
          parseVarStatement(true);
          return;
        }
      default:
        break;
    }
    const initialTokensLength = state.tokens.length;
    parseExpression();
    let simpleName = null;
    if (state.tokens.length === initialTokensLength + 1) {
      const token = state.tokens[state.tokens.length - 1];
      if (token.type === TokenType3.name) {
        simpleName = token.contextualKeyword;
      }
    }
    if (simpleName == null) {
      semicolon();
      return;
    }
    if (eat2(TokenType3.colon)) {
      parseLabeledStatement();
    } else {
      parseIdentifierStatement(simpleName);
    }
  }
  function startsAwaitUsing() {
    if (!isContextual(ContextualKeyword._await)) {
      return false;
    }
    const snapshot = state.snapshot();
    next();
    if (!isContextual(ContextualKeyword._using) || hasPrecedingLineBreak()) {
      state.restoreFromSnapshot(snapshot);
      return false;
    }
    next();
    if (!match(TokenType3.name) || hasPrecedingLineBreak()) {
      state.restoreFromSnapshot(snapshot);
      return false;
    }
    state.restoreFromSnapshot(snapshot);
    return true;
  }
  function parseDecorators() {
    while (match(TokenType3.at)) {
      parseDecorator();
    }
  }
  function parseDecorator() {
    next();
    if (eat2(TokenType3.parenL)) {
      parseExpression();
      expect(TokenType3.parenR);
    } else {
      parseIdentifier();
      while (eat2(TokenType3.dot)) {
        parseIdentifier();
      }
      parseMaybeDecoratorArguments();
    }
  }
  function parseMaybeDecoratorArguments() {
    if (isTypeScriptEnabled) {
      tsParseMaybeDecoratorArguments();
    } else {
      baseParseMaybeDecoratorArguments();
    }
  }
  function baseParseMaybeDecoratorArguments() {
    if (eat2(TokenType3.parenL)) {
      parseCallExpressionArguments();
    }
  }
  function parseBreakContinueStatement() {
    next();
    if (!isLineTerminator()) {
      parseIdentifier();
      semicolon();
    }
  }
  function parseDebuggerStatement() {
    next();
    semicolon();
  }
  function parseDoStatement() {
    next();
    parseStatement(false);
    expect(TokenType3._while);
    parseParenExpression();
    eat2(TokenType3.semi);
  }
  function parseForStatement() {
    state.scopeDepth++;
    const startTokenIndex = state.tokens.length;
    parseAmbiguousForStatement();
    const endTokenIndex = state.tokens.length;
    state.scopes.push(new Scope3(startTokenIndex, endTokenIndex, false));
    state.scopeDepth--;
  }
  function isUsingInLoop() {
    if (!isContextual(ContextualKeyword._using)) {
      return false;
    }
    if (isLookaheadContextual(ContextualKeyword._of)) {
      return false;
    }
    return true;
  }
  function parseAmbiguousForStatement() {
    next();
    let forAwait = false;
    if (isContextual(ContextualKeyword._await)) {
      forAwait = true;
      next();
    }
    expect(TokenType3.parenL);
    if (match(TokenType3.semi)) {
      if (forAwait) {
        unexpected();
      }
      parseFor();
      return;
    }
    const isAwaitUsing = startsAwaitUsing();
    if (isAwaitUsing || match(TokenType3._var) || match(TokenType3._let) || match(TokenType3._const) || isUsingInLoop()) {
      if (isAwaitUsing) {
        expectContextual(ContextualKeyword._await);
      }
      next();
      parseVar(true, state.type !== TokenType3._var);
      if (match(TokenType3._in) || isContextual(ContextualKeyword._of)) {
        parseForIn(forAwait);
        return;
      }
      parseFor();
      return;
    }
    parseExpression(true);
    if (match(TokenType3._in) || isContextual(ContextualKeyword._of)) {
      parseForIn(forAwait);
      return;
    }
    if (forAwait) {
      unexpected();
    }
    parseFor();
  }
  function parseFunctionStatement() {
    const functionStart = state.start;
    next();
    parseFunction(functionStart, true);
  }
  function parseIfStatement() {
    next();
    parseParenExpression();
    parseStatement(false);
    if (eat2(TokenType3._else)) {
      parseStatement(false);
    }
  }
  function parseReturnStatement() {
    next();
    if (!isLineTerminator()) {
      parseExpression();
      semicolon();
    }
  }
  function parseSwitchStatement() {
    next();
    parseParenExpression();
    state.scopeDepth++;
    const startTokenIndex = state.tokens.length;
    expect(TokenType3.braceL);
    while (!match(TokenType3.braceR) && !state.error) {
      if (match(TokenType3._case) || match(TokenType3._default)) {
        const isCase = match(TokenType3._case);
        next();
        if (isCase) {
          parseExpression();
        }
        expect(TokenType3.colon);
      } else {
        parseStatement(true);
      }
    }
    next();
    const endTokenIndex = state.tokens.length;
    state.scopes.push(new Scope3(startTokenIndex, endTokenIndex, false));
    state.scopeDepth--;
  }
  function parseThrowStatement() {
    next();
    parseExpression();
    semicolon();
  }
  function parseCatchClauseParam() {
    parseBindingAtom(
      true
      /* isBlockScope */
    );
    if (isTypeScriptEnabled) {
      tsTryParseTypeAnnotation();
    }
  }
  function parseTryStatement() {
    next();
    parseBlock();
    if (match(TokenType3._catch)) {
      next();
      let catchBindingStartTokenIndex = null;
      if (match(TokenType3.parenL)) {
        state.scopeDepth++;
        catchBindingStartTokenIndex = state.tokens.length;
        expect(TokenType3.parenL);
        parseCatchClauseParam();
        expect(TokenType3.parenR);
      }
      parseBlock();
      if (catchBindingStartTokenIndex != null) {
        const endTokenIndex = state.tokens.length;
        state.scopes.push(new Scope3(catchBindingStartTokenIndex, endTokenIndex, false));
        state.scopeDepth--;
      }
    }
    if (eat2(TokenType3._finally)) {
      parseBlock();
    }
  }
  function parseVarStatement(isBlockScope) {
    next();
    parseVar(false, isBlockScope);
    semicolon();
  }
  function parseWhileStatement() {
    next();
    parseParenExpression();
    parseStatement(false);
  }
  function parseEmptyStatement() {
    next();
  }
  function parseLabeledStatement() {
    parseStatement(true);
  }
  function parseIdentifierStatement(contextualKeyword) {
    if (isTypeScriptEnabled) {
      tsParseIdentifierStatement(contextualKeyword);
    } else if (isFlowEnabled) {
      flowParseIdentifierStatement(contextualKeyword);
    } else {
      semicolon();
    }
  }
  function parseBlock(isFunctionScope = false, contextId = 0) {
    const startTokenIndex = state.tokens.length;
    state.scopeDepth++;
    expect(TokenType3.braceL);
    if (contextId) {
      state.tokens[state.tokens.length - 1].contextId = contextId;
    }
    parseBlockBody(TokenType3.braceR);
    if (contextId) {
      state.tokens[state.tokens.length - 1].contextId = contextId;
    }
    const endTokenIndex = state.tokens.length;
    state.scopes.push(new Scope3(startTokenIndex, endTokenIndex, isFunctionScope));
    state.scopeDepth--;
  }
  function parseBlockBody(end) {
    while (!eat2(end) && !state.error) {
      parseStatement(true);
    }
  }
  function parseFor() {
    expect(TokenType3.semi);
    if (!match(TokenType3.semi)) {
      parseExpression();
    }
    expect(TokenType3.semi);
    if (!match(TokenType3.parenR)) {
      parseExpression();
    }
    expect(TokenType3.parenR);
    parseStatement(false);
  }
  function parseForIn(forAwait) {
    if (forAwait) {
      eatContextual(ContextualKeyword._of);
    } else {
      next();
    }
    parseExpression();
    expect(TokenType3.parenR);
    parseStatement(false);
  }
  function parseVar(isFor, isBlockScope) {
    while (true) {
      parseVarHead(isBlockScope);
      if (eat2(TokenType3.eq)) {
        const eqIndex = state.tokens.length - 1;
        parseMaybeAssign(isFor);
        state.tokens[eqIndex].rhsEndIndex = state.tokens.length;
      }
      if (!eat2(TokenType3.comma)) {
        break;
      }
    }
  }
  function parseVarHead(isBlockScope) {
    parseBindingAtom(isBlockScope);
    if (isTypeScriptEnabled) {
      tsAfterParseVarHead();
    } else if (isFlowEnabled) {
      flowAfterParseVarHead();
    }
  }
  function parseFunction(functionStart, isStatement, optionalId = false) {
    if (match(TokenType3.star)) {
      next();
    }
    if (isStatement && !optionalId && !match(TokenType3.name) && !match(TokenType3._yield)) {
      unexpected();
    }
    let nameScopeStartTokenIndex = null;
    if (match(TokenType3.name)) {
      if (!isStatement) {
        nameScopeStartTokenIndex = state.tokens.length;
        state.scopeDepth++;
      }
      parseBindingIdentifier(false);
    }
    const startTokenIndex = state.tokens.length;
    state.scopeDepth++;
    parseFunctionParams();
    parseFunctionBodyAndFinish(functionStart);
    const endTokenIndex = state.tokens.length;
    state.scopes.push(new Scope3(startTokenIndex, endTokenIndex, true));
    state.scopeDepth--;
    if (nameScopeStartTokenIndex !== null) {
      state.scopes.push(new Scope3(nameScopeStartTokenIndex, endTokenIndex, true));
      state.scopeDepth--;
    }
  }
  function parseFunctionParams(allowModifiers = false, funcContextId = 0) {
    if (isTypeScriptEnabled) {
      tsStartParseFunctionParams();
    } else if (isFlowEnabled) {
      flowStartParseFunctionParams();
    }
    expect(TokenType3.parenL);
    if (funcContextId) {
      state.tokens[state.tokens.length - 1].contextId = funcContextId;
    }
    parseBindingList(
      TokenType3.parenR,
      false,
      false,
      allowModifiers,
      funcContextId
    );
    if (funcContextId) {
      state.tokens[state.tokens.length - 1].contextId = funcContextId;
    }
  }
  function parseClass(isStatement, optionalId = false) {
    const contextId = getNextContextId();
    next();
    state.tokens[state.tokens.length - 1].contextId = contextId;
    state.tokens[state.tokens.length - 1].isExpression = !isStatement;
    let nameScopeStartTokenIndex = null;
    if (!isStatement) {
      nameScopeStartTokenIndex = state.tokens.length;
      state.scopeDepth++;
    }
    parseClassId(isStatement, optionalId);
    parseClassSuper();
    const openBraceIndex = state.tokens.length;
    parseClassBody(contextId);
    if (state.error) {
      return;
    }
    state.tokens[openBraceIndex].contextId = contextId;
    state.tokens[state.tokens.length - 1].contextId = contextId;
    if (nameScopeStartTokenIndex !== null) {
      const endTokenIndex = state.tokens.length;
      state.scopes.push(new Scope3(nameScopeStartTokenIndex, endTokenIndex, false));
      state.scopeDepth--;
    }
  }
  function isClassProperty() {
    return match(TokenType3.eq) || match(TokenType3.semi) || match(TokenType3.braceR) || match(TokenType3.bang) || match(TokenType3.colon);
  }
  function isClassMethod() {
    return match(TokenType3.parenL) || match(TokenType3.lessThan);
  }
  function parseClassBody(classContextId) {
    expect(TokenType3.braceL);
    while (!eat2(TokenType3.braceR) && !state.error) {
      if (eat2(TokenType3.semi)) {
        continue;
      }
      if (match(TokenType3.at)) {
        parseDecorator();
        continue;
      }
      const memberStart = state.start;
      parseClassMember(memberStart, classContextId);
    }
  }
  function parseClassMember(memberStart, classContextId) {
    if (isTypeScriptEnabled) {
      tsParseModifiers([
        ContextualKeyword._declare,
        ContextualKeyword._public,
        ContextualKeyword._protected,
        ContextualKeyword._private,
        ContextualKeyword._override
      ]);
    }
    let isStatic = false;
    if (match(TokenType3.name) && state.contextualKeyword === ContextualKeyword._static) {
      parseIdentifier();
      if (isClassMethod()) {
        parseClassMethod(
          memberStart,
          /* isConstructor */
          false
        );
        return;
      } else if (isClassProperty()) {
        parseClassProperty();
        return;
      }
      state.tokens[state.tokens.length - 1].type = TokenType3._static;
      isStatic = true;
      if (match(TokenType3.braceL)) {
        state.tokens[state.tokens.length - 1].contextId = classContextId;
        parseBlock();
        return;
      }
    }
    parseClassMemberWithIsStatic(memberStart, isStatic, classContextId);
  }
  function parseClassMemberWithIsStatic(memberStart, isStatic, classContextId) {
    if (isTypeScriptEnabled) {
      if (tsTryParseClassMemberWithIsStatic(isStatic)) {
        return;
      }
    }
    if (eat2(TokenType3.star)) {
      parseClassPropertyName(classContextId);
      parseClassMethod(
        memberStart,
        /* isConstructor */
        false
      );
      return;
    }
    parseClassPropertyName(classContextId);
    let isConstructor = false;
    const token = state.tokens[state.tokens.length - 1];
    if (token.contextualKeyword === ContextualKeyword._constructor) {
      isConstructor = true;
    }
    parsePostMemberNameModifiers();
    if (isClassMethod()) {
      parseClassMethod(memberStart, isConstructor);
    } else if (isClassProperty()) {
      parseClassProperty();
    } else if (token.contextualKeyword === ContextualKeyword._async && !isLineTerminator()) {
      state.tokens[state.tokens.length - 1].type = TokenType3._async;
      const isGenerator = match(TokenType3.star);
      if (isGenerator) {
        next();
      }
      parseClassPropertyName(classContextId);
      parsePostMemberNameModifiers();
      parseClassMethod(
        memberStart,
        false
        /* isConstructor */
      );
    } else if ((token.contextualKeyword === ContextualKeyword._get || token.contextualKeyword === ContextualKeyword._set) && !(isLineTerminator() && match(TokenType3.star))) {
      if (token.contextualKeyword === ContextualKeyword._get) {
        state.tokens[state.tokens.length - 1].type = TokenType3._get;
      } else {
        state.tokens[state.tokens.length - 1].type = TokenType3._set;
      }
      parseClassPropertyName(classContextId);
      parseClassMethod(
        memberStart,
        /* isConstructor */
        false
      );
    } else if (token.contextualKeyword === ContextualKeyword._accessor && !isLineTerminator()) {
      parseClassPropertyName(classContextId);
      parseClassProperty();
    } else if (isLineTerminator()) {
      parseClassProperty();
    } else {
      unexpected();
    }
  }
  function parseClassMethod(functionStart, isConstructor) {
    if (isTypeScriptEnabled) {
      tsTryParseTypeParameters();
    } else if (isFlowEnabled) {
      if (match(TokenType3.lessThan)) {
        flowParseTypeParameterDeclaration();
      }
    }
    parseMethod(functionStart, isConstructor);
  }
  function parseClassPropertyName(classContextId) {
    parsePropertyName(classContextId);
  }
  function parsePostMemberNameModifiers() {
    if (isTypeScriptEnabled) {
      const oldIsType = pushTypeContext(0);
      eat2(TokenType3.question);
      popTypeContext(oldIsType);
    }
  }
  function parseClassProperty() {
    if (isTypeScriptEnabled) {
      eatTypeToken(TokenType3.bang);
      tsTryParseTypeAnnotation();
    } else if (isFlowEnabled) {
      if (match(TokenType3.colon)) {
        flowParseTypeAnnotation();
      }
    }
    if (match(TokenType3.eq)) {
      const equalsTokenIndex = state.tokens.length;
      next();
      parseMaybeAssign();
      state.tokens[equalsTokenIndex].rhsEndIndex = state.tokens.length;
    }
    semicolon();
  }
  function parseClassId(isStatement, optionalId = false) {
    if (isTypeScriptEnabled && (!isStatement || optionalId) && isContextual(ContextualKeyword._implements)) {
      return;
    }
    if (match(TokenType3.name)) {
      parseBindingIdentifier(true);
    }
    if (isTypeScriptEnabled) {
      tsTryParseTypeParameters();
    } else if (isFlowEnabled) {
      if (match(TokenType3.lessThan)) {
        flowParseTypeParameterDeclaration();
      }
    }
  }
  function parseClassSuper() {
    let hasSuper = false;
    if (eat2(TokenType3._extends)) {
      parseExprSubscripts();
      hasSuper = true;
    } else {
      hasSuper = false;
    }
    if (isTypeScriptEnabled) {
      tsAfterParseClassSuper(hasSuper);
    } else if (isFlowEnabled) {
      flowAfterParseClassSuper(hasSuper);
    }
  }
  function parseExport() {
    const exportIndex = state.tokens.length - 1;
    if (isTypeScriptEnabled) {
      if (tsTryParseExport()) {
        return;
      }
    }
    if (shouldParseExportStar()) {
      parseExportStar();
    } else if (isExportDefaultSpecifier()) {
      parseIdentifier();
      if (match(TokenType3.comma) && lookaheadType() === TokenType3.star) {
        expect(TokenType3.comma);
        expect(TokenType3.star);
        expectContextual(ContextualKeyword._as);
        parseIdentifier();
      } else {
        parseExportSpecifiersMaybe();
      }
      parseExportFrom();
    } else if (eat2(TokenType3._default)) {
      parseExportDefaultExpression();
    } else if (shouldParseExportDeclaration()) {
      parseExportDeclaration();
    } else {
      parseExportSpecifiers();
      parseExportFrom();
    }
    state.tokens[exportIndex].rhsEndIndex = state.tokens.length;
  }
  function parseExportDefaultExpression() {
    if (isTypeScriptEnabled) {
      if (tsTryParseExportDefaultExpression()) {
        return;
      }
    }
    if (isFlowEnabled) {
      if (flowTryParseExportDefaultExpression()) {
        return;
      }
    }
    const functionStart = state.start;
    if (eat2(TokenType3._function)) {
      parseFunction(functionStart, true, true);
    } else if (isContextual(ContextualKeyword._async) && lookaheadType() === TokenType3._function) {
      eatContextual(ContextualKeyword._async);
      eat2(TokenType3._function);
      parseFunction(functionStart, true, true);
    } else if (match(TokenType3._class)) {
      parseClass(true, true);
    } else if (match(TokenType3.at)) {
      parseDecorators();
      parseClass(true, true);
    } else {
      parseMaybeAssign();
      semicolon();
    }
  }
  function parseExportDeclaration() {
    if (isTypeScriptEnabled) {
      tsParseExportDeclaration();
    } else if (isFlowEnabled) {
      flowParseExportDeclaration();
    } else {
      parseStatement(true);
    }
  }
  function isExportDefaultSpecifier() {
    if (isTypeScriptEnabled && tsIsDeclarationStart()) {
      return false;
    } else if (isFlowEnabled && flowShouldDisallowExportDefaultSpecifier()) {
      return false;
    }
    if (match(TokenType3.name)) {
      return state.contextualKeyword !== ContextualKeyword._async;
    }
    if (!match(TokenType3._default)) {
      return false;
    }
    const _next = nextTokenStart();
    const lookahead2 = lookaheadTypeAndKeyword();
    const hasFrom = lookahead2.type === TokenType3.name && lookahead2.contextualKeyword === ContextualKeyword._from;
    if (lookahead2.type === TokenType3.comma) {
      return true;
    }
    if (hasFrom) {
      const nextAfterFrom = input.charCodeAt(nextTokenStartSince(_next + 4));
      return nextAfterFrom === charCodes.quotationMark || nextAfterFrom === charCodes.apostrophe;
    }
    return false;
  }
  function parseExportSpecifiersMaybe() {
    if (eat2(TokenType3.comma)) {
      parseExportSpecifiers();
    }
  }
  function parseExportFrom() {
    if (eatContextual(ContextualKeyword._from)) {
      parseExprAtom();
      maybeParseImportAttributes();
    }
    semicolon();
  }
  function shouldParseExportStar() {
    if (isFlowEnabled) {
      return flowShouldParseExportStar();
    } else {
      return match(TokenType3.star);
    }
  }
  function parseExportStar() {
    if (isFlowEnabled) {
      flowParseExportStar();
    } else {
      baseParseExportStar();
    }
  }
  function baseParseExportStar() {
    expect(TokenType3.star);
    if (isContextual(ContextualKeyword._as)) {
      parseExportNamespace();
    } else {
      parseExportFrom();
    }
  }
  function parseExportNamespace() {
    next();
    state.tokens[state.tokens.length - 1].type = TokenType3._as;
    parseIdentifier();
    parseExportSpecifiersMaybe();
    parseExportFrom();
  }
  function shouldParseExportDeclaration() {
    return isTypeScriptEnabled && tsIsDeclarationStart() || isFlowEnabled && flowShouldParseExportDeclaration() || state.type === TokenType3._var || state.type === TokenType3._const || state.type === TokenType3._let || state.type === TokenType3._function || state.type === TokenType3._class || isContextual(ContextualKeyword._async) || match(TokenType3.at);
  }
  function parseExportSpecifiers() {
    let first = true;
    expect(TokenType3.braceL);
    while (!eat2(TokenType3.braceR) && !state.error) {
      if (first) {
        first = false;
      } else {
        expect(TokenType3.comma);
        if (eat2(TokenType3.braceR)) {
          break;
        }
      }
      parseExportSpecifier();
    }
  }
  function parseExportSpecifier() {
    if (isTypeScriptEnabled) {
      tsParseExportSpecifier();
      return;
    }
    parseIdentifier();
    state.tokens[state.tokens.length - 1].identifierRole = IdentifierRole.ExportAccess;
    if (eatContextual(ContextualKeyword._as)) {
      parseIdentifier();
    }
  }
  function isImportReflection() {
    const snapshot = state.snapshot();
    expectContextual(ContextualKeyword._module);
    if (eatContextual(ContextualKeyword._from)) {
      if (isContextual(ContextualKeyword._from)) {
        state.restoreFromSnapshot(snapshot);
        return true;
      } else {
        state.restoreFromSnapshot(snapshot);
        return false;
      }
    } else if (match(TokenType3.comma)) {
      state.restoreFromSnapshot(snapshot);
      return false;
    } else {
      state.restoreFromSnapshot(snapshot);
      return true;
    }
  }
  function parseMaybeImportReflection() {
    if (isContextual(ContextualKeyword._module) && isImportReflection()) {
      next();
    }
  }
  function parseImport() {
    if (isTypeScriptEnabled && match(TokenType3.name) && lookaheadType() === TokenType3.eq) {
      tsParseImportEqualsDeclaration();
      return;
    }
    if (isTypeScriptEnabled && isContextual(ContextualKeyword._type)) {
      const lookahead2 = lookaheadTypeAndKeyword();
      if (lookahead2.type === TokenType3.name && lookahead2.contextualKeyword !== ContextualKeyword._from) {
        expectContextual(ContextualKeyword._type);
        if (lookaheadType() === TokenType3.eq) {
          tsParseImportEqualsDeclaration();
          return;
        }
      } else if (lookahead2.type === TokenType3.star || lookahead2.type === TokenType3.braceL) {
        expectContextual(ContextualKeyword._type);
      }
    }
    if (match(TokenType3.string)) {
      parseExprAtom();
    } else {
      parseMaybeImportReflection();
      parseImportSpecifiers();
      expectContextual(ContextualKeyword._from);
      parseExprAtom();
    }
    maybeParseImportAttributes();
    semicolon();
  }
  function shouldParseDefaultImport() {
    return match(TokenType3.name);
  }
  function parseImportSpecifierLocal() {
    parseImportedIdentifier();
  }
  function parseImportSpecifiers() {
    if (isFlowEnabled) {
      flowStartParseImportSpecifiers();
    }
    let first = true;
    if (shouldParseDefaultImport()) {
      parseImportSpecifierLocal();
      if (!eat2(TokenType3.comma)) return;
    }
    if (match(TokenType3.star)) {
      next();
      expectContextual(ContextualKeyword._as);
      parseImportSpecifierLocal();
      return;
    }
    expect(TokenType3.braceL);
    while (!eat2(TokenType3.braceR) && !state.error) {
      if (first) {
        first = false;
      } else {
        if (eat2(TokenType3.colon)) {
          unexpected(
            "ES2015 named imports do not destructure. Use another statement for destructuring after the import."
          );
        }
        expect(TokenType3.comma);
        if (eat2(TokenType3.braceR)) {
          break;
        }
      }
      parseImportSpecifier();
    }
  }
  function parseImportSpecifier() {
    if (isTypeScriptEnabled) {
      tsParseImportSpecifier();
      return;
    }
    if (isFlowEnabled) {
      flowParseImportSpecifier();
      return;
    }
    parseImportedIdentifier();
    if (isContextual(ContextualKeyword._as)) {
      state.tokens[state.tokens.length - 1].identifierRole = IdentifierRole.ImportAccess;
      next();
      parseImportedIdentifier();
    }
  }
  function maybeParseImportAttributes() {
    if (match(TokenType3._with) || isContextual(ContextualKeyword._assert) && !hasPrecedingLineBreak()) {
      next();
      parseObj(false, false);
    }
  }

  // node_modules/sucrase/dist/esm/parser/traverser/index.js
  function parseFile() {
    if (state.pos === 0 && input.charCodeAt(0) === charCodes.numberSign && input.charCodeAt(1) === charCodes.exclamationMark) {
      skipLineComment(2);
    }
    nextToken();
    return parseTopLevel();
  }

  // node_modules/sucrase/dist/esm/parser/index.js
  var File = class {
    constructor(tokens, scopes) {
      this.tokens = tokens;
      this.scopes = scopes;
    }
  };
  function parse4(input2, isJSXEnabled2, isTypeScriptEnabled2, isFlowEnabled2) {
    if (isFlowEnabled2 && isTypeScriptEnabled2) {
      throw new Error("Cannot combine flow and typescript plugins.");
    }
    initParser(input2, isJSXEnabled2, isTypeScriptEnabled2, isFlowEnabled2);
    const result = parseFile();
    if (state.error) {
      throw augmentError(state.error);
    }
    return result;
  }

  // node_modules/sucrase/dist/esm/util/isAsyncOperation.js
  function isAsyncOperation(tokens) {
    let index = tokens.currentIndex();
    let depth = 0;
    const startToken = tokens.currentToken();
    do {
      const token = tokens.tokens[index];
      if (token.isOptionalChainStart) {
        depth++;
      }
      if (token.isOptionalChainEnd) {
        depth--;
      }
      depth += token.numNullishCoalesceStarts;
      depth -= token.numNullishCoalesceEnds;
      if (token.contextualKeyword === ContextualKeyword._await && token.identifierRole == null && token.scopeDepth === startToken.scopeDepth) {
        return true;
      }
      index += 1;
    } while (depth > 0 && index < tokens.tokens.length);
    return false;
  }

  // node_modules/sucrase/dist/esm/TokenProcessor.js
  var TokenProcessor = class _TokenProcessor {
    __init() {
      this.resultCode = "";
    }
    // Array mapping input token index to optional string index position in the
    // output code.
    __init2() {
      this.resultMappings = new Array(this.tokens.length);
    }
    __init3() {
      this.tokenIndex = 0;
    }
    constructor(code, tokens, isFlowEnabled2, disableESTransforms, helperManager) {
      ;
      this.code = code;
      this.tokens = tokens;
      this.isFlowEnabled = isFlowEnabled2;
      this.disableESTransforms = disableESTransforms;
      this.helperManager = helperManager;
      _TokenProcessor.prototype.__init.call(this);
      _TokenProcessor.prototype.__init2.call(this);
      _TokenProcessor.prototype.__init3.call(this);
    }
    /**
     * Snapshot the token state in a way that can be restored later, useful for
     * things like lookahead.
     *
     * resultMappings do not need to be copied since in all use cases, they will
     * be overwritten anyway after restore.
     */
    snapshot() {
      return {
        resultCode: this.resultCode,
        tokenIndex: this.tokenIndex
      };
    }
    restoreToSnapshot(snapshot) {
      this.resultCode = snapshot.resultCode;
      this.tokenIndex = snapshot.tokenIndex;
    }
    /**
     * Remove and return the code generated since the snapshot, leaving the
     * current token position in-place. Unlike most TokenProcessor operations,
     * this operation can result in input/output line number mismatches because
     * the removed code may contain newlines, so this operation should be used
     * sparingly.
     */
    dangerouslyGetAndRemoveCodeSinceSnapshot(snapshot) {
      const result = this.resultCode.slice(snapshot.resultCode.length);
      this.resultCode = snapshot.resultCode;
      return result;
    }
    reset() {
      this.resultCode = "";
      this.resultMappings = new Array(this.tokens.length);
      this.tokenIndex = 0;
    }
    matchesContextualAtIndex(index, contextualKeyword) {
      return this.matches1AtIndex(index, TokenType3.name) && this.tokens[index].contextualKeyword === contextualKeyword;
    }
    identifierNameAtIndex(index) {
      return this.identifierNameForToken(this.tokens[index]);
    }
    identifierNameAtRelativeIndex(relativeIndex) {
      return this.identifierNameForToken(this.tokenAtRelativeIndex(relativeIndex));
    }
    identifierName() {
      return this.identifierNameForToken(this.currentToken());
    }
    identifierNameForToken(token) {
      return this.code.slice(token.start, token.end);
    }
    rawCodeForToken(token) {
      return this.code.slice(token.start, token.end);
    }
    stringValueAtIndex(index) {
      return this.stringValueForToken(this.tokens[index]);
    }
    stringValue() {
      return this.stringValueForToken(this.currentToken());
    }
    stringValueForToken(token) {
      return this.code.slice(token.start + 1, token.end - 1);
    }
    matches1AtIndex(index, t1) {
      return this.tokens[index].type === t1;
    }
    matches2AtIndex(index, t1, t2) {
      return this.tokens[index].type === t1 && this.tokens[index + 1].type === t2;
    }
    matches3AtIndex(index, t1, t2, t3) {
      return this.tokens[index].type === t1 && this.tokens[index + 1].type === t2 && this.tokens[index + 2].type === t3;
    }
    matches1(t1) {
      return this.tokens[this.tokenIndex].type === t1;
    }
    matches2(t1, t2) {
      return this.tokens[this.tokenIndex].type === t1 && this.tokens[this.tokenIndex + 1].type === t2;
    }
    matches3(t1, t2, t3) {
      return this.tokens[this.tokenIndex].type === t1 && this.tokens[this.tokenIndex + 1].type === t2 && this.tokens[this.tokenIndex + 2].type === t3;
    }
    matches4(t1, t2, t3, t4) {
      return this.tokens[this.tokenIndex].type === t1 && this.tokens[this.tokenIndex + 1].type === t2 && this.tokens[this.tokenIndex + 2].type === t3 && this.tokens[this.tokenIndex + 3].type === t4;
    }
    matches5(t1, t2, t3, t4, t5) {
      return this.tokens[this.tokenIndex].type === t1 && this.tokens[this.tokenIndex + 1].type === t2 && this.tokens[this.tokenIndex + 2].type === t3 && this.tokens[this.tokenIndex + 3].type === t4 && this.tokens[this.tokenIndex + 4].type === t5;
    }
    matchesContextual(contextualKeyword) {
      return this.matchesContextualAtIndex(this.tokenIndex, contextualKeyword);
    }
    matchesContextIdAndLabel(type, contextId) {
      return this.matches1(type) && this.currentToken().contextId === contextId;
    }
    previousWhitespaceAndComments() {
      let whitespaceAndComments = this.code.slice(
        this.tokenIndex > 0 ? this.tokens[this.tokenIndex - 1].end : 0,
        this.tokenIndex < this.tokens.length ? this.tokens[this.tokenIndex].start : this.code.length
      );
      if (this.isFlowEnabled) {
        whitespaceAndComments = whitespaceAndComments.replace(/@flow/g, "");
      }
      return whitespaceAndComments;
    }
    replaceToken(newCode) {
      this.resultCode += this.previousWhitespaceAndComments();
      this.appendTokenPrefix();
      this.resultMappings[this.tokenIndex] = this.resultCode.length;
      this.resultCode += newCode;
      this.appendTokenSuffix();
      this.tokenIndex++;
    }
    replaceTokenTrimmingLeftWhitespace(newCode) {
      this.resultCode += this.previousWhitespaceAndComments().replace(/[^\r\n]/g, "");
      this.appendTokenPrefix();
      this.resultMappings[this.tokenIndex] = this.resultCode.length;
      this.resultCode += newCode;
      this.appendTokenSuffix();
      this.tokenIndex++;
    }
    removeInitialToken() {
      this.replaceToken("");
    }
    removeToken() {
      this.replaceTokenTrimmingLeftWhitespace("");
    }
    /**
     * Remove all code until the next }, accounting for balanced braces.
     */
    removeBalancedCode() {
      let braceDepth = 0;
      while (!this.isAtEnd()) {
        if (this.matches1(TokenType3.braceL)) {
          braceDepth++;
        } else if (this.matches1(TokenType3.braceR)) {
          if (braceDepth === 0) {
            return;
          }
          braceDepth--;
        }
        this.removeToken();
      }
    }
    copyExpectedToken(tokenType) {
      if (this.tokens[this.tokenIndex].type !== tokenType) {
        throw new Error(`Expected token ${tokenType}`);
      }
      this.copyToken();
    }
    copyToken() {
      this.resultCode += this.previousWhitespaceAndComments();
      this.appendTokenPrefix();
      this.resultMappings[this.tokenIndex] = this.resultCode.length;
      this.resultCode += this.code.slice(
        this.tokens[this.tokenIndex].start,
        this.tokens[this.tokenIndex].end
      );
      this.appendTokenSuffix();
      this.tokenIndex++;
    }
    copyTokenWithPrefix(prefix) {
      this.resultCode += this.previousWhitespaceAndComments();
      this.appendTokenPrefix();
      this.resultCode += prefix;
      this.resultMappings[this.tokenIndex] = this.resultCode.length;
      this.resultCode += this.code.slice(
        this.tokens[this.tokenIndex].start,
        this.tokens[this.tokenIndex].end
      );
      this.appendTokenSuffix();
      this.tokenIndex++;
    }
    appendTokenPrefix() {
      const token = this.currentToken();
      if (token.numNullishCoalesceStarts || token.isOptionalChainStart) {
        token.isAsyncOperation = isAsyncOperation(this);
      }
      if (this.disableESTransforms) {
        return;
      }
      if (token.numNullishCoalesceStarts) {
        for (let i = 0; i < token.numNullishCoalesceStarts; i++) {
          if (token.isAsyncOperation) {
            this.resultCode += "await ";
            this.resultCode += this.helperManager.getHelperName("asyncNullishCoalesce");
          } else {
            this.resultCode += this.helperManager.getHelperName("nullishCoalesce");
          }
          this.resultCode += "(";
        }
      }
      if (token.isOptionalChainStart) {
        if (token.isAsyncOperation) {
          this.resultCode += "await ";
        }
        if (this.tokenIndex > 0 && this.tokenAtRelativeIndex(-1).type === TokenType3._delete) {
          if (token.isAsyncOperation) {
            this.resultCode += this.helperManager.getHelperName("asyncOptionalChainDelete");
          } else {
            this.resultCode += this.helperManager.getHelperName("optionalChainDelete");
          }
        } else if (token.isAsyncOperation) {
          this.resultCode += this.helperManager.getHelperName("asyncOptionalChain");
        } else {
          this.resultCode += this.helperManager.getHelperName("optionalChain");
        }
        this.resultCode += "([";
      }
    }
    appendTokenSuffix() {
      const token = this.currentToken();
      if (token.isOptionalChainEnd && !this.disableESTransforms) {
        this.resultCode += "])";
      }
      if (token.numNullishCoalesceEnds && !this.disableESTransforms) {
        for (let i = 0; i < token.numNullishCoalesceEnds; i++) {
          this.resultCode += "))";
        }
      }
    }
    appendCode(code) {
      this.resultCode += code;
    }
    currentToken() {
      return this.tokens[this.tokenIndex];
    }
    currentTokenCode() {
      const token = this.currentToken();
      return this.code.slice(token.start, token.end);
    }
    tokenAtRelativeIndex(relativeIndex) {
      return this.tokens[this.tokenIndex + relativeIndex];
    }
    currentIndex() {
      return this.tokenIndex;
    }
    /**
     * Move to the next token. Only suitable in preprocessing steps. When
     * generating new code, you should use copyToken or removeToken.
     */
    nextToken() {
      if (this.tokenIndex === this.tokens.length) {
        throw new Error("Unexpectedly reached end of input.");
      }
      this.tokenIndex++;
    }
    previousToken() {
      this.tokenIndex--;
    }
    finish() {
      if (this.tokenIndex !== this.tokens.length) {
        throw new Error("Tried to finish processing tokens before reaching the end.");
      }
      this.resultCode += this.previousWhitespaceAndComments();
      return { code: this.resultCode, mappings: this.resultMappings };
    }
    isAtEnd() {
      return this.tokenIndex === this.tokens.length;
    }
  };

  // node_modules/sucrase/dist/esm/util/getClassInfo.js
  function getClassInfo(rootTransformer, tokens, nameManager, disableESTransforms) {
    const snapshot = tokens.snapshot();
    const headerInfo = processClassHeader(tokens);
    let constructorInitializerStatements = [];
    const instanceInitializerNames = [];
    const staticInitializerNames = [];
    let constructorInsertPos = null;
    const fields = [];
    const rangesToRemove = [];
    const classContextId = tokens.currentToken().contextId;
    if (classContextId == null) {
      throw new Error("Expected non-null class context ID on class open-brace.");
    }
    tokens.nextToken();
    while (!tokens.matchesContextIdAndLabel(TokenType3.braceR, classContextId)) {
      if (tokens.matchesContextual(ContextualKeyword._constructor) && !tokens.currentToken().isType) {
        ({ constructorInitializerStatements, constructorInsertPos } = processConstructor(tokens));
      } else if (tokens.matches1(TokenType3.semi)) {
        if (!disableESTransforms) {
          rangesToRemove.push({ start: tokens.currentIndex(), end: tokens.currentIndex() + 1 });
        }
        tokens.nextToken();
      } else if (tokens.currentToken().isType) {
        tokens.nextToken();
      } else {
        const statementStartIndex = tokens.currentIndex();
        let isStatic = false;
        let isESPrivate = false;
        let isDeclareOrAbstract = false;
        while (isAccessModifier(tokens.currentToken())) {
          if (tokens.matches1(TokenType3._static)) {
            isStatic = true;
          }
          if (tokens.matches1(TokenType3.hash)) {
            isESPrivate = true;
          }
          if (tokens.matches1(TokenType3._declare) || tokens.matches1(TokenType3._abstract)) {
            isDeclareOrAbstract = true;
          }
          tokens.nextToken();
        }
        if (isStatic && tokens.matches1(TokenType3.braceL)) {
          skipToNextClassElement(tokens, classContextId);
          continue;
        }
        if (isESPrivate) {
          skipToNextClassElement(tokens, classContextId);
          continue;
        }
        if (tokens.matchesContextual(ContextualKeyword._constructor) && !tokens.currentToken().isType) {
          ({ constructorInitializerStatements, constructorInsertPos } = processConstructor(tokens));
          continue;
        }
        const nameStartIndex = tokens.currentIndex();
        skipFieldName(tokens);
        if (tokens.matches1(TokenType3.lessThan) || tokens.matches1(TokenType3.parenL)) {
          skipToNextClassElement(tokens, classContextId);
          continue;
        }
        while (tokens.currentToken().isType) {
          tokens.nextToken();
        }
        if (tokens.matches1(TokenType3.eq)) {
          const equalsIndex = tokens.currentIndex();
          const valueEnd = tokens.currentToken().rhsEndIndex;
          if (valueEnd == null) {
            throw new Error("Expected rhsEndIndex on class field assignment.");
          }
          tokens.nextToken();
          while (tokens.currentIndex() < valueEnd) {
            rootTransformer.processToken();
          }
          let initializerName;
          if (isStatic) {
            initializerName = nameManager.claimFreeName("__initStatic");
            staticInitializerNames.push(initializerName);
          } else {
            initializerName = nameManager.claimFreeName("__init");
            instanceInitializerNames.push(initializerName);
          }
          fields.push({
            initializerName,
            equalsIndex,
            start: nameStartIndex,
            end: tokens.currentIndex()
          });
        } else if (!disableESTransforms || isDeclareOrAbstract) {
          rangesToRemove.push({ start: statementStartIndex, end: tokens.currentIndex() });
        }
      }
    }
    tokens.restoreToSnapshot(snapshot);
    if (disableESTransforms) {
      return {
        headerInfo,
        constructorInitializerStatements,
        instanceInitializerNames: [],
        staticInitializerNames: [],
        constructorInsertPos,
        fields: [],
        rangesToRemove
      };
    } else {
      return {
        headerInfo,
        constructorInitializerStatements,
        instanceInitializerNames,
        staticInitializerNames,
        constructorInsertPos,
        fields,
        rangesToRemove
      };
    }
  }
  function skipToNextClassElement(tokens, classContextId) {
    tokens.nextToken();
    while (tokens.currentToken().contextId !== classContextId) {
      tokens.nextToken();
    }
    while (isAccessModifier(tokens.tokenAtRelativeIndex(-1))) {
      tokens.previousToken();
    }
  }
  function processClassHeader(tokens) {
    const classToken = tokens.currentToken();
    const contextId = classToken.contextId;
    if (contextId == null) {
      throw new Error("Expected context ID on class token.");
    }
    const isExpression = classToken.isExpression;
    if (isExpression == null) {
      throw new Error("Expected isExpression on class token.");
    }
    let className = null;
    let hasSuperclass = false;
    tokens.nextToken();
    if (tokens.matches1(TokenType3.name)) {
      className = tokens.identifierName();
    }
    while (!tokens.matchesContextIdAndLabel(TokenType3.braceL, contextId)) {
      if (tokens.matches1(TokenType3._extends) && !tokens.currentToken().isType) {
        hasSuperclass = true;
      }
      tokens.nextToken();
    }
    return { isExpression, className, hasSuperclass };
  }
  function processConstructor(tokens) {
    const constructorInitializerStatements = [];
    tokens.nextToken();
    const constructorContextId = tokens.currentToken().contextId;
    if (constructorContextId == null) {
      throw new Error("Expected context ID on open-paren starting constructor params.");
    }
    while (!tokens.matchesContextIdAndLabel(TokenType3.parenR, constructorContextId)) {
      if (tokens.currentToken().contextId === constructorContextId) {
        tokens.nextToken();
        if (isAccessModifier(tokens.currentToken())) {
          tokens.nextToken();
          while (isAccessModifier(tokens.currentToken())) {
            tokens.nextToken();
          }
          const token = tokens.currentToken();
          if (token.type !== TokenType3.name) {
            throw new Error("Expected identifier after access modifiers in constructor arg.");
          }
          const name = tokens.identifierNameForToken(token);
          constructorInitializerStatements.push(`this.${name} = ${name}`);
        }
      } else {
        tokens.nextToken();
      }
    }
    tokens.nextToken();
    while (tokens.currentToken().isType) {
      tokens.nextToken();
    }
    let constructorInsertPos = tokens.currentIndex();
    let foundSuperCall = false;
    while (!tokens.matchesContextIdAndLabel(TokenType3.braceR, constructorContextId)) {
      if (!foundSuperCall && tokens.matches2(TokenType3._super, TokenType3.parenL)) {
        tokens.nextToken();
        const superCallContextId = tokens.currentToken().contextId;
        if (superCallContextId == null) {
          throw new Error("Expected a context ID on the super call");
        }
        while (!tokens.matchesContextIdAndLabel(TokenType3.parenR, superCallContextId)) {
          tokens.nextToken();
        }
        constructorInsertPos = tokens.currentIndex();
        foundSuperCall = true;
      }
      tokens.nextToken();
    }
    tokens.nextToken();
    return { constructorInitializerStatements, constructorInsertPos };
  }
  function isAccessModifier(token) {
    return [
      TokenType3._async,
      TokenType3._get,
      TokenType3._set,
      TokenType3.plus,
      TokenType3.minus,
      TokenType3._readonly,
      TokenType3._static,
      TokenType3._public,
      TokenType3._private,
      TokenType3._protected,
      TokenType3._override,
      TokenType3._abstract,
      TokenType3.star,
      TokenType3._declare,
      TokenType3.hash
    ].includes(token.type);
  }
  function skipFieldName(tokens) {
    if (tokens.matches1(TokenType3.bracketL)) {
      const startToken = tokens.currentToken();
      const classContextId = startToken.contextId;
      if (classContextId == null) {
        throw new Error("Expected class context ID on computed name open bracket.");
      }
      while (!tokens.matchesContextIdAndLabel(TokenType3.bracketR, classContextId)) {
        tokens.nextToken();
      }
      tokens.nextToken();
    } else {
      tokens.nextToken();
    }
  }

  // node_modules/sucrase/dist/esm/util/elideImportEquals.js
  function elideImportEquals(tokens) {
    tokens.removeInitialToken();
    tokens.removeToken();
    tokens.removeToken();
    tokens.removeToken();
    if (tokens.matches1(TokenType3.parenL)) {
      tokens.removeToken();
      tokens.removeToken();
      tokens.removeToken();
    } else {
      while (tokens.matches1(TokenType3.dot)) {
        tokens.removeToken();
        tokens.removeToken();
      }
    }
  }

  // node_modules/sucrase/dist/esm/util/getDeclarationInfo.js
  var EMPTY_DECLARATION_INFO = {
    typeDeclarations: /* @__PURE__ */ new Set(),
    valueDeclarations: /* @__PURE__ */ new Set()
  };
  function getDeclarationInfo(tokens) {
    const typeDeclarations = /* @__PURE__ */ new Set();
    const valueDeclarations = /* @__PURE__ */ new Set();
    for (let i = 0; i < tokens.tokens.length; i++) {
      const token = tokens.tokens[i];
      if (token.type === TokenType3.name && isTopLevelDeclaration(token)) {
        if (token.isType) {
          typeDeclarations.add(tokens.identifierNameForToken(token));
        } else {
          valueDeclarations.add(tokens.identifierNameForToken(token));
        }
      }
    }
    return { typeDeclarations, valueDeclarations };
  }

  // node_modules/sucrase/dist/esm/util/isExportFrom.js
  function isExportFrom(tokens) {
    let closeBraceIndex = tokens.currentIndex();
    while (!tokens.matches1AtIndex(closeBraceIndex, TokenType3.braceR)) {
      closeBraceIndex++;
    }
    return tokens.matchesContextualAtIndex(closeBraceIndex + 1, ContextualKeyword._from) && tokens.matches1AtIndex(closeBraceIndex + 2, TokenType3.string);
  }

  // node_modules/sucrase/dist/esm/util/removeMaybeImportAttributes.js
  function removeMaybeImportAttributes(tokens) {
    if (tokens.matches2(TokenType3._with, TokenType3.braceL) || tokens.matches2(TokenType3.name, TokenType3.braceL) && tokens.matchesContextual(ContextualKeyword._assert)) {
      tokens.removeToken();
      tokens.removeToken();
      tokens.removeBalancedCode();
      tokens.removeToken();
    }
  }

  // node_modules/sucrase/dist/esm/util/shouldElideDefaultExport.js
  function shouldElideDefaultExport(isTypeScriptTransformEnabled, keepUnusedImports, tokens, declarationInfo) {
    if (!isTypeScriptTransformEnabled || keepUnusedImports) {
      return false;
    }
    const exportToken = tokens.currentToken();
    if (exportToken.rhsEndIndex == null) {
      throw new Error("Expected non-null rhsEndIndex on export token.");
    }
    const numTokens = exportToken.rhsEndIndex - tokens.currentIndex();
    if (numTokens !== 3 && !(numTokens === 4 && tokens.matches1AtIndex(exportToken.rhsEndIndex - 1, TokenType3.semi))) {
      return false;
    }
    const identifierToken = tokens.tokenAtRelativeIndex(2);
    if (identifierToken.type !== TokenType3.name) {
      return false;
    }
    const exportedName = tokens.identifierNameForToken(identifierToken);
    return declarationInfo.typeDeclarations.has(exportedName) && !declarationInfo.valueDeclarations.has(exportedName);
  }

  // node_modules/sucrase/dist/esm/transformers/CJSImportTransformer.js
  var CJSImportTransformer = class _CJSImportTransformer extends Transformer {
    __init() {
      this.hadExport = false;
    }
    __init2() {
      this.hadNamedExport = false;
    }
    __init3() {
      this.hadDefaultExport = false;
    }
    constructor(rootTransformer, tokens, importProcessor, nameManager, helperManager, reactHotLoaderTransformer, enableLegacyBabel5ModuleInterop, enableLegacyTypeScriptModuleInterop, isTypeScriptTransformEnabled, isFlowTransformEnabled, preserveDynamicImport, keepUnusedImports) {
      super();
      this.rootTransformer = rootTransformer;
      this.tokens = tokens;
      this.importProcessor = importProcessor;
      this.nameManager = nameManager;
      this.helperManager = helperManager;
      this.reactHotLoaderTransformer = reactHotLoaderTransformer;
      this.enableLegacyBabel5ModuleInterop = enableLegacyBabel5ModuleInterop;
      this.enableLegacyTypeScriptModuleInterop = enableLegacyTypeScriptModuleInterop;
      this.isTypeScriptTransformEnabled = isTypeScriptTransformEnabled;
      this.isFlowTransformEnabled = isFlowTransformEnabled;
      this.preserveDynamicImport = preserveDynamicImport;
      this.keepUnusedImports = keepUnusedImports;
      _CJSImportTransformer.prototype.__init.call(this);
      _CJSImportTransformer.prototype.__init2.call(this);
      _CJSImportTransformer.prototype.__init3.call(this);
      ;
      this.declarationInfo = isTypeScriptTransformEnabled ? getDeclarationInfo(tokens) : EMPTY_DECLARATION_INFO;
    }
    getPrefixCode() {
      let prefix = "";
      if (this.hadExport) {
        prefix += 'Object.defineProperty(exports, "__esModule", {value: true});';
      }
      return prefix;
    }
    getSuffixCode() {
      if (this.enableLegacyBabel5ModuleInterop && this.hadDefaultExport && !this.hadNamedExport) {
        return "\nmodule.exports = exports.default;\n";
      }
      return "";
    }
    process() {
      if (this.tokens.matches3(TokenType3._import, TokenType3.name, TokenType3.eq)) {
        return this.processImportEquals();
      }
      if (this.tokens.matches1(TokenType3._import)) {
        this.processImport();
        return true;
      }
      if (this.tokens.matches2(TokenType3._export, TokenType3.eq)) {
        this.tokens.replaceToken("module.exports");
        return true;
      }
      if (this.tokens.matches1(TokenType3._export) && !this.tokens.currentToken().isType) {
        this.hadExport = true;
        return this.processExport();
      }
      if (this.tokens.matches2(TokenType3.name, TokenType3.postIncDec)) {
        if (this.processPostIncDec()) {
          return true;
        }
      }
      if (this.tokens.matches1(TokenType3.name) || this.tokens.matches1(TokenType3.jsxName)) {
        return this.processIdentifier();
      }
      if (this.tokens.matches1(TokenType3.eq)) {
        return this.processAssignment();
      }
      if (this.tokens.matches1(TokenType3.assign)) {
        return this.processComplexAssignment();
      }
      if (this.tokens.matches1(TokenType3.preIncDec)) {
        return this.processPreIncDec();
      }
      return false;
    }
    processImportEquals() {
      const importName = this.tokens.identifierNameAtIndex(this.tokens.currentIndex() + 1);
      if (this.importProcessor.shouldAutomaticallyElideImportedName(importName)) {
        elideImportEquals(this.tokens);
      } else {
        this.tokens.replaceToken("const");
      }
      return true;
    }
    /**
     * Transform this:
     * import foo, {bar} from 'baz';
     * into
     * var _baz = require('baz'); var _baz2 = _interopRequireDefault(_baz);
     *
     * The import code was already generated in the import preprocessing step, so
     * we just need to look it up.
     */
    processImport() {
      if (this.tokens.matches2(TokenType3._import, TokenType3.parenL)) {
        if (this.preserveDynamicImport) {
          this.tokens.copyToken();
          return;
        }
        const requireWrapper = this.enableLegacyTypeScriptModuleInterop ? "" : `${this.helperManager.getHelperName("interopRequireWildcard")}(`;
        this.tokens.replaceToken(`Promise.resolve().then(() => ${requireWrapper}require`);
        const contextId = this.tokens.currentToken().contextId;
        if (contextId == null) {
          throw new Error("Expected context ID on dynamic import invocation.");
        }
        this.tokens.copyToken();
        while (!this.tokens.matchesContextIdAndLabel(TokenType3.parenR, contextId)) {
          this.rootTransformer.processToken();
        }
        this.tokens.replaceToken(requireWrapper ? ")))" : "))");
        return;
      }
      const shouldElideImport = this.removeImportAndDetectIfShouldElide();
      if (shouldElideImport) {
        this.tokens.removeToken();
      } else {
        const path = this.tokens.stringValue();
        this.tokens.replaceTokenTrimmingLeftWhitespace(this.importProcessor.claimImportCode(path));
        this.tokens.appendCode(this.importProcessor.claimImportCode(path));
      }
      removeMaybeImportAttributes(this.tokens);
      if (this.tokens.matches1(TokenType3.semi)) {
        this.tokens.removeToken();
      }
    }
    /**
     * Erase this import (since any CJS output would be completely different), and
     * return true if this import is should be elided due to being a type-only
     * import. Such imports will not be emitted at all to avoid side effects.
     *
     * Import elision only happens with the TypeScript or Flow transforms enabled.
     *
     * TODO: This function has some awkward overlap with
     *  CJSImportProcessor.pruneTypeOnlyImports , and the two should be unified.
     *  That function handles TypeScript implicit import name elision, and removes
     *  an import if all typical imported names (without `type`) are removed due
     *  to being type-only imports. This function handles Flow import removal and
     *  properly distinguishes `import 'foo'` from `import {} from 'foo'` for TS
     *  purposes.
     *
     * The position should end at the import string.
     */
    removeImportAndDetectIfShouldElide() {
      this.tokens.removeInitialToken();
      if (this.tokens.matchesContextual(ContextualKeyword._type) && !this.tokens.matches1AtIndex(this.tokens.currentIndex() + 1, TokenType3.comma) && !this.tokens.matchesContextualAtIndex(this.tokens.currentIndex() + 1, ContextualKeyword._from)) {
        this.removeRemainingImport();
        return true;
      }
      if (this.tokens.matches1(TokenType3.name) || this.tokens.matches1(TokenType3.star)) {
        this.removeRemainingImport();
        return false;
      }
      if (this.tokens.matches1(TokenType3.string)) {
        return false;
      }
      let foundNonTypeImport = false;
      let foundAnyNamedImport = false;
      while (!this.tokens.matches1(TokenType3.string)) {
        if (!foundNonTypeImport && this.tokens.matches1(TokenType3.braceL) || this.tokens.matches1(TokenType3.comma)) {
          this.tokens.removeToken();
          if (!this.tokens.matches1(TokenType3.braceR)) {
            foundAnyNamedImport = true;
          }
          if (this.tokens.matches2(TokenType3.name, TokenType3.comma) || this.tokens.matches2(TokenType3.name, TokenType3.braceR) || this.tokens.matches4(TokenType3.name, TokenType3.name, TokenType3.name, TokenType3.comma) || this.tokens.matches4(TokenType3.name, TokenType3.name, TokenType3.name, TokenType3.braceR)) {
            foundNonTypeImport = true;
          }
        }
        this.tokens.removeToken();
      }
      if (this.keepUnusedImports) {
        return false;
      }
      if (this.isTypeScriptTransformEnabled) {
        return !foundNonTypeImport;
      } else if (this.isFlowTransformEnabled) {
        return foundAnyNamedImport && !foundNonTypeImport;
      } else {
        return false;
      }
    }
    removeRemainingImport() {
      while (!this.tokens.matches1(TokenType3.string)) {
        this.tokens.removeToken();
      }
    }
    processIdentifier() {
      const token = this.tokens.currentToken();
      if (token.shadowsGlobal) {
        return false;
      }
      if (token.identifierRole === IdentifierRole.ObjectShorthand) {
        return this.processObjectShorthand();
      }
      if (token.identifierRole !== IdentifierRole.Access) {
        return false;
      }
      const replacement = this.importProcessor.getIdentifierReplacement(
        this.tokens.identifierNameForToken(token)
      );
      if (!replacement) {
        return false;
      }
      let possibleOpenParenIndex = this.tokens.currentIndex() + 1;
      while (possibleOpenParenIndex < this.tokens.tokens.length && this.tokens.tokens[possibleOpenParenIndex].type === TokenType3.parenR) {
        possibleOpenParenIndex++;
      }
      if (this.tokens.tokens[possibleOpenParenIndex].type === TokenType3.parenL) {
        if (this.tokens.tokenAtRelativeIndex(1).type === TokenType3.parenL && this.tokens.tokenAtRelativeIndex(-1).type !== TokenType3._new) {
          this.tokens.replaceToken(`${replacement}.call(void 0, `);
          this.tokens.removeToken();
          this.rootTransformer.processBalancedCode();
          this.tokens.copyExpectedToken(TokenType3.parenR);
        } else {
          this.tokens.replaceToken(`(0, ${replacement})`);
        }
      } else {
        this.tokens.replaceToken(replacement);
      }
      return true;
    }
    processObjectShorthand() {
      const identifier = this.tokens.identifierName();
      const replacement = this.importProcessor.getIdentifierReplacement(identifier);
      if (!replacement) {
        return false;
      }
      this.tokens.replaceToken(`${identifier}: ${replacement}`);
      return true;
    }
    processExport() {
      if (this.tokens.matches2(TokenType3._export, TokenType3._enum) || this.tokens.matches3(TokenType3._export, TokenType3._const, TokenType3._enum)) {
        this.hadNamedExport = true;
        return false;
      }
      if (this.tokens.matches2(TokenType3._export, TokenType3._default)) {
        if (this.tokens.matches3(TokenType3._export, TokenType3._default, TokenType3._enum)) {
          this.hadDefaultExport = true;
          return false;
        }
        this.processExportDefault();
        return true;
      } else if (this.tokens.matches2(TokenType3._export, TokenType3.braceL)) {
        this.processExportBindings();
        return true;
      } else if (this.tokens.matches2(TokenType3._export, TokenType3.name) && this.tokens.matchesContextualAtIndex(this.tokens.currentIndex() + 1, ContextualKeyword._type)) {
        this.tokens.removeInitialToken();
        this.tokens.removeToken();
        if (this.tokens.matches1(TokenType3.braceL)) {
          while (!this.tokens.matches1(TokenType3.braceR)) {
            this.tokens.removeToken();
          }
          this.tokens.removeToken();
        } else {
          this.tokens.removeToken();
          if (this.tokens.matches1(TokenType3._as)) {
            this.tokens.removeToken();
            this.tokens.removeToken();
          }
        }
        if (this.tokens.matchesContextual(ContextualKeyword._from) && this.tokens.matches1AtIndex(this.tokens.currentIndex() + 1, TokenType3.string)) {
          this.tokens.removeToken();
          this.tokens.removeToken();
          removeMaybeImportAttributes(this.tokens);
        }
        return true;
      }
      this.hadNamedExport = true;
      if (this.tokens.matches2(TokenType3._export, TokenType3._var) || this.tokens.matches2(TokenType3._export, TokenType3._let) || this.tokens.matches2(TokenType3._export, TokenType3._const)) {
        this.processExportVar();
        return true;
      } else if (this.tokens.matches2(TokenType3._export, TokenType3._function) || // export async function
      this.tokens.matches3(TokenType3._export, TokenType3.name, TokenType3._function)) {
        this.processExportFunction();
        return true;
      } else if (this.tokens.matches2(TokenType3._export, TokenType3._class) || this.tokens.matches3(TokenType3._export, TokenType3._abstract, TokenType3._class) || this.tokens.matches2(TokenType3._export, TokenType3.at)) {
        this.processExportClass();
        return true;
      } else if (this.tokens.matches2(TokenType3._export, TokenType3.star)) {
        this.processExportStar();
        return true;
      } else {
        throw new Error("Unrecognized export syntax.");
      }
    }
    processAssignment() {
      const index = this.tokens.currentIndex();
      const identifierToken = this.tokens.tokens[index - 1];
      if (identifierToken.isType || identifierToken.type !== TokenType3.name) {
        return false;
      }
      if (identifierToken.shadowsGlobal) {
        return false;
      }
      if (index >= 2 && this.tokens.matches1AtIndex(index - 2, TokenType3.dot)) {
        return false;
      }
      if (index >= 2 && [TokenType3._var, TokenType3._let, TokenType3._const].includes(this.tokens.tokens[index - 2].type)) {
        return false;
      }
      const assignmentSnippet = this.importProcessor.resolveExportBinding(
        this.tokens.identifierNameForToken(identifierToken)
      );
      if (!assignmentSnippet) {
        return false;
      }
      this.tokens.copyToken();
      this.tokens.appendCode(` ${assignmentSnippet} =`);
      return true;
    }
    /**
     * Process something like `a += 3`, where `a` might be an exported value.
     */
    processComplexAssignment() {
      const index = this.tokens.currentIndex();
      const identifierToken = this.tokens.tokens[index - 1];
      if (identifierToken.type !== TokenType3.name) {
        return false;
      }
      if (identifierToken.shadowsGlobal) {
        return false;
      }
      if (index >= 2 && this.tokens.matches1AtIndex(index - 2, TokenType3.dot)) {
        return false;
      }
      const assignmentSnippet = this.importProcessor.resolveExportBinding(
        this.tokens.identifierNameForToken(identifierToken)
      );
      if (!assignmentSnippet) {
        return false;
      }
      this.tokens.appendCode(` = ${assignmentSnippet}`);
      this.tokens.copyToken();
      return true;
    }
    /**
     * Process something like `++a`, where `a` might be an exported value.
     */
    processPreIncDec() {
      const index = this.tokens.currentIndex();
      const identifierToken = this.tokens.tokens[index + 1];
      if (identifierToken.type !== TokenType3.name) {
        return false;
      }
      if (identifierToken.shadowsGlobal) {
        return false;
      }
      if (index + 2 < this.tokens.tokens.length && (this.tokens.matches1AtIndex(index + 2, TokenType3.dot) || this.tokens.matches1AtIndex(index + 2, TokenType3.bracketL) || this.tokens.matches1AtIndex(index + 2, TokenType3.parenL))) {
        return false;
      }
      const identifierName = this.tokens.identifierNameForToken(identifierToken);
      const assignmentSnippet = this.importProcessor.resolveExportBinding(identifierName);
      if (!assignmentSnippet) {
        return false;
      }
      this.tokens.appendCode(`${assignmentSnippet} = `);
      this.tokens.copyToken();
      return true;
    }
    /**
     * Process something like `a++`, where `a` might be an exported value.
     * This starts at the `a`, not at the `++`.
     */
    processPostIncDec() {
      const index = this.tokens.currentIndex();
      const identifierToken = this.tokens.tokens[index];
      const operatorToken = this.tokens.tokens[index + 1];
      if (identifierToken.type !== TokenType3.name) {
        return false;
      }
      if (identifierToken.shadowsGlobal) {
        return false;
      }
      if (index >= 1 && this.tokens.matches1AtIndex(index - 1, TokenType3.dot)) {
        return false;
      }
      const identifierName = this.tokens.identifierNameForToken(identifierToken);
      const assignmentSnippet = this.importProcessor.resolveExportBinding(identifierName);
      if (!assignmentSnippet) {
        return false;
      }
      const operatorCode = this.tokens.rawCodeForToken(operatorToken);
      const base = this.importProcessor.getIdentifierReplacement(identifierName) || identifierName;
      if (operatorCode === "++") {
        this.tokens.replaceToken(`(${base} = ${assignmentSnippet} = ${base} + 1, ${base} - 1)`);
      } else if (operatorCode === "--") {
        this.tokens.replaceToken(`(${base} = ${assignmentSnippet} = ${base} - 1, ${base} + 1)`);
      } else {
        throw new Error(`Unexpected operator: ${operatorCode}`);
      }
      this.tokens.removeToken();
      return true;
    }
    processExportDefault() {
      let exportedRuntimeValue = true;
      if (this.tokens.matches4(TokenType3._export, TokenType3._default, TokenType3._function, TokenType3.name) || // export default async function
      this.tokens.matches5(TokenType3._export, TokenType3._default, TokenType3.name, TokenType3._function, TokenType3.name) && this.tokens.matchesContextualAtIndex(
        this.tokens.currentIndex() + 2,
        ContextualKeyword._async
      )) {
        this.tokens.removeInitialToken();
        this.tokens.removeToken();
        const name = this.processNamedFunction();
        this.tokens.appendCode(` exports.default = ${name};`);
      } else if (this.tokens.matches4(TokenType3._export, TokenType3._default, TokenType3._class, TokenType3.name) || this.tokens.matches5(TokenType3._export, TokenType3._default, TokenType3._abstract, TokenType3._class, TokenType3.name) || this.tokens.matches3(TokenType3._export, TokenType3._default, TokenType3.at)) {
        this.tokens.removeInitialToken();
        this.tokens.removeToken();
        this.copyDecorators();
        if (this.tokens.matches1(TokenType3._abstract)) {
          this.tokens.removeToken();
        }
        const name = this.rootTransformer.processNamedClass();
        this.tokens.appendCode(` exports.default = ${name};`);
      } else if (shouldElideDefaultExport(
        this.isTypeScriptTransformEnabled,
        this.keepUnusedImports,
        this.tokens,
        this.declarationInfo
      )) {
        exportedRuntimeValue = false;
        this.tokens.removeInitialToken();
        this.tokens.removeToken();
        this.tokens.removeToken();
      } else if (this.reactHotLoaderTransformer) {
        const defaultVarName = this.nameManager.claimFreeName("_default");
        this.tokens.replaceToken(`let ${defaultVarName}; exports.`);
        this.tokens.copyToken();
        this.tokens.appendCode(` = ${defaultVarName} =`);
        this.reactHotLoaderTransformer.setExtractedDefaultExportName(defaultVarName);
      } else {
        this.tokens.replaceToken("exports.");
        this.tokens.copyToken();
        this.tokens.appendCode(" =");
      }
      if (exportedRuntimeValue) {
        this.hadDefaultExport = true;
      }
    }
    copyDecorators() {
      while (this.tokens.matches1(TokenType3.at)) {
        this.tokens.copyToken();
        if (this.tokens.matches1(TokenType3.parenL)) {
          this.tokens.copyExpectedToken(TokenType3.parenL);
          this.rootTransformer.processBalancedCode();
          this.tokens.copyExpectedToken(TokenType3.parenR);
        } else {
          this.tokens.copyExpectedToken(TokenType3.name);
          while (this.tokens.matches1(TokenType3.dot)) {
            this.tokens.copyExpectedToken(TokenType3.dot);
            this.tokens.copyExpectedToken(TokenType3.name);
          }
          if (this.tokens.matches1(TokenType3.parenL)) {
            this.tokens.copyExpectedToken(TokenType3.parenL);
            this.rootTransformer.processBalancedCode();
            this.tokens.copyExpectedToken(TokenType3.parenR);
          }
        }
      }
    }
    /**
     * Transform a declaration like `export var`, `export let`, or `export const`.
     */
    processExportVar() {
      if (this.isSimpleExportVar()) {
        this.processSimpleExportVar();
      } else {
        this.processComplexExportVar();
      }
    }
    /**
     * Determine if the export is of the form:
     * export var/let/const [varName] = [expr];
     * In other words, determine if function name inference might apply.
     */
    isSimpleExportVar() {
      let tokenIndex = this.tokens.currentIndex();
      tokenIndex++;
      tokenIndex++;
      if (!this.tokens.matches1AtIndex(tokenIndex, TokenType3.name)) {
        return false;
      }
      tokenIndex++;
      while (tokenIndex < this.tokens.tokens.length && this.tokens.tokens[tokenIndex].isType) {
        tokenIndex++;
      }
      if (!this.tokens.matches1AtIndex(tokenIndex, TokenType3.eq)) {
        return false;
      }
      return true;
    }
    /**
     * Transform an `export var` declaration initializing a single variable.
     *
     * For example, this:
     * export const f = () => {};
     * becomes this:
     * const f = () => {}; exports.f = f;
     *
     * The variable is unused (e.g. exports.f has the true value of the export).
     * We need to produce an assignment of this form so that the function will
     * have an inferred name of "f", which wouldn't happen in the more general
     * case below.
     */
    processSimpleExportVar() {
      this.tokens.removeInitialToken();
      this.tokens.copyToken();
      const varName = this.tokens.identifierName();
      while (!this.tokens.matches1(TokenType3.eq)) {
        this.rootTransformer.processToken();
      }
      const endIndex = this.tokens.currentToken().rhsEndIndex;
      if (endIndex == null) {
        throw new Error("Expected = token with an end index.");
      }
      while (this.tokens.currentIndex() < endIndex) {
        this.rootTransformer.processToken();
      }
      this.tokens.appendCode(`; exports.${varName} = ${varName}`);
    }
    /**
     * Transform normal declaration exports, including handling destructuring.
     * For example, this:
     * export const {x: [a = 2, b], c} = d;
     * becomes this:
     * ({x: [exports.a = 2, exports.b], c: exports.c} = d;)
     */
    processComplexExportVar() {
      this.tokens.removeInitialToken();
      this.tokens.removeToken();
      const needsParens = this.tokens.matches1(TokenType3.braceL);
      if (needsParens) {
        this.tokens.appendCode("(");
      }
      let depth = 0;
      while (true) {
        if (this.tokens.matches1(TokenType3.braceL) || this.tokens.matches1(TokenType3.dollarBraceL) || this.tokens.matches1(TokenType3.bracketL)) {
          depth++;
          this.tokens.copyToken();
        } else if (this.tokens.matches1(TokenType3.braceR) || this.tokens.matches1(TokenType3.bracketR)) {
          depth--;
          this.tokens.copyToken();
        } else if (depth === 0 && !this.tokens.matches1(TokenType3.name) && !this.tokens.currentToken().isType) {
          break;
        } else if (this.tokens.matches1(TokenType3.eq)) {
          const endIndex = this.tokens.currentToken().rhsEndIndex;
          if (endIndex == null) {
            throw new Error("Expected = token with an end index.");
          }
          while (this.tokens.currentIndex() < endIndex) {
            this.rootTransformer.processToken();
          }
        } else {
          const token = this.tokens.currentToken();
          if (isDeclaration(token)) {
            const name = this.tokens.identifierName();
            let replacement = this.importProcessor.getIdentifierReplacement(name);
            if (replacement === null) {
              throw new Error(`Expected a replacement for ${name} in \`export var\` syntax.`);
            }
            if (isObjectShorthandDeclaration(token)) {
              replacement = `${name}: ${replacement}`;
            }
            this.tokens.replaceToken(replacement);
          } else {
            this.rootTransformer.processToken();
          }
        }
      }
      if (needsParens) {
        const endIndex = this.tokens.currentToken().rhsEndIndex;
        if (endIndex == null) {
          throw new Error("Expected = token with an end index.");
        }
        while (this.tokens.currentIndex() < endIndex) {
          this.rootTransformer.processToken();
        }
        this.tokens.appendCode(")");
      }
    }
    /**
     * Transform this:
     * export function foo() {}
     * into this:
     * function foo() {} exports.foo = foo;
     */
    processExportFunction() {
      this.tokens.replaceToken("");
      const name = this.processNamedFunction();
      this.tokens.appendCode(` exports.${name} = ${name};`);
    }
    /**
     * Skip past a function with a name and return that name.
     */
    processNamedFunction() {
      if (this.tokens.matches1(TokenType3._function)) {
        this.tokens.copyToken();
      } else if (this.tokens.matches2(TokenType3.name, TokenType3._function)) {
        if (!this.tokens.matchesContextual(ContextualKeyword._async)) {
          throw new Error("Expected async keyword in function export.");
        }
        this.tokens.copyToken();
        this.tokens.copyToken();
      }
      if (this.tokens.matches1(TokenType3.star)) {
        this.tokens.copyToken();
      }
      if (!this.tokens.matches1(TokenType3.name)) {
        throw new Error("Expected identifier for exported function name.");
      }
      const name = this.tokens.identifierName();
      this.tokens.copyToken();
      if (this.tokens.currentToken().isType) {
        this.tokens.removeInitialToken();
        while (this.tokens.currentToken().isType) {
          this.tokens.removeToken();
        }
      }
      this.tokens.copyExpectedToken(TokenType3.parenL);
      this.rootTransformer.processBalancedCode();
      this.tokens.copyExpectedToken(TokenType3.parenR);
      this.rootTransformer.processPossibleTypeRange();
      this.tokens.copyExpectedToken(TokenType3.braceL);
      this.rootTransformer.processBalancedCode();
      this.tokens.copyExpectedToken(TokenType3.braceR);
      return name;
    }
    /**
     * Transform this:
     * export class A {}
     * into this:
     * class A {} exports.A = A;
     */
    processExportClass() {
      this.tokens.removeInitialToken();
      this.copyDecorators();
      if (this.tokens.matches1(TokenType3._abstract)) {
        this.tokens.removeToken();
      }
      const name = this.rootTransformer.processNamedClass();
      this.tokens.appendCode(` exports.${name} = ${name};`);
    }
    /**
     * Transform this:
     * export {a, b as c};
     * into this:
     * exports.a = a; exports.c = b;
     *
     * OR
     *
     * Transform this:
     * export {a, b as c} from './foo';
     * into the pre-generated Object.defineProperty code from the ImportProcessor.
     *
     * For the first case, if the TypeScript transform is enabled, we need to skip
     * exports that are only defined as types.
     */
    processExportBindings() {
      this.tokens.removeInitialToken();
      this.tokens.removeToken();
      const isReExport = isExportFrom(this.tokens);
      const exportStatements = [];
      while (true) {
        if (this.tokens.matches1(TokenType3.braceR)) {
          this.tokens.removeToken();
          break;
        }
        const specifierInfo = getImportExportSpecifierInfo(this.tokens);
        while (this.tokens.currentIndex() < specifierInfo.endIndex) {
          this.tokens.removeToken();
        }
        const shouldRemoveExport = specifierInfo.isType || !isReExport && this.shouldElideExportedIdentifier(specifierInfo.leftName);
        if (!shouldRemoveExport) {
          const exportedName = specifierInfo.rightName;
          if (exportedName === "default") {
            this.hadDefaultExport = true;
          } else {
            this.hadNamedExport = true;
          }
          const localName = specifierInfo.leftName;
          const newLocalName = this.importProcessor.getIdentifierReplacement(localName);
          exportStatements.push(`exports.${exportedName} = ${newLocalName || localName};`);
        }
        if (this.tokens.matches1(TokenType3.braceR)) {
          this.tokens.removeToken();
          break;
        }
        if (this.tokens.matches2(TokenType3.comma, TokenType3.braceR)) {
          this.tokens.removeToken();
          this.tokens.removeToken();
          break;
        } else if (this.tokens.matches1(TokenType3.comma)) {
          this.tokens.removeToken();
        } else {
          throw new Error(`Unexpected token: ${JSON.stringify(this.tokens.currentToken())}`);
        }
      }
      if (this.tokens.matchesContextual(ContextualKeyword._from)) {
        this.tokens.removeToken();
        const path = this.tokens.stringValue();
        this.tokens.replaceTokenTrimmingLeftWhitespace(this.importProcessor.claimImportCode(path));
        removeMaybeImportAttributes(this.tokens);
      } else {
        this.tokens.appendCode(exportStatements.join(" "));
      }
      if (this.tokens.matches1(TokenType3.semi)) {
        this.tokens.removeToken();
      }
    }
    processExportStar() {
      this.tokens.removeInitialToken();
      while (!this.tokens.matches1(TokenType3.string)) {
        this.tokens.removeToken();
      }
      const path = this.tokens.stringValue();
      this.tokens.replaceTokenTrimmingLeftWhitespace(this.importProcessor.claimImportCode(path));
      removeMaybeImportAttributes(this.tokens);
      if (this.tokens.matches1(TokenType3.semi)) {
        this.tokens.removeToken();
      }
    }
    shouldElideExportedIdentifier(name) {
      return this.isTypeScriptTransformEnabled && !this.keepUnusedImports && !this.declarationInfo.valueDeclarations.has(name);
    }
  };

  // node_modules/sucrase/dist/esm/transformers/ESMImportTransformer.js
  var ESMImportTransformer = class extends Transformer {
    constructor(tokens, nameManager, helperManager, reactHotLoaderTransformer, isTypeScriptTransformEnabled, isFlowTransformEnabled, keepUnusedImports, options) {
      super();
      this.tokens = tokens;
      this.nameManager = nameManager;
      this.helperManager = helperManager;
      this.reactHotLoaderTransformer = reactHotLoaderTransformer;
      this.isTypeScriptTransformEnabled = isTypeScriptTransformEnabled;
      this.isFlowTransformEnabled = isFlowTransformEnabled;
      this.keepUnusedImports = keepUnusedImports;
      ;
      this.nonTypeIdentifiers = isTypeScriptTransformEnabled && !keepUnusedImports ? getNonTypeIdentifiers(tokens, options) : /* @__PURE__ */ new Set();
      this.declarationInfo = isTypeScriptTransformEnabled && !keepUnusedImports ? getDeclarationInfo(tokens) : EMPTY_DECLARATION_INFO;
      this.injectCreateRequireForImportRequire = Boolean(options.injectCreateRequireForImportRequire);
    }
    process() {
      if (this.tokens.matches3(TokenType3._import, TokenType3.name, TokenType3.eq)) {
        return this.processImportEquals();
      }
      if (this.tokens.matches4(TokenType3._import, TokenType3.name, TokenType3.name, TokenType3.eq) && this.tokens.matchesContextualAtIndex(this.tokens.currentIndex() + 1, ContextualKeyword._type)) {
        this.tokens.removeInitialToken();
        for (let i = 0; i < 7; i++) {
          this.tokens.removeToken();
        }
        return true;
      }
      if (this.tokens.matches2(TokenType3._export, TokenType3.eq)) {
        this.tokens.replaceToken("module.exports");
        return true;
      }
      if (this.tokens.matches5(TokenType3._export, TokenType3._import, TokenType3.name, TokenType3.name, TokenType3.eq) && this.tokens.matchesContextualAtIndex(this.tokens.currentIndex() + 2, ContextualKeyword._type)) {
        this.tokens.removeInitialToken();
        for (let i = 0; i < 8; i++) {
          this.tokens.removeToken();
        }
        return true;
      }
      if (this.tokens.matches1(TokenType3._import)) {
        return this.processImport();
      }
      if (this.tokens.matches2(TokenType3._export, TokenType3._default)) {
        return this.processExportDefault();
      }
      if (this.tokens.matches2(TokenType3._export, TokenType3.braceL)) {
        return this.processNamedExports();
      }
      if (this.tokens.matches2(TokenType3._export, TokenType3.name) && this.tokens.matchesContextualAtIndex(this.tokens.currentIndex() + 1, ContextualKeyword._type)) {
        this.tokens.removeInitialToken();
        this.tokens.removeToken();
        if (this.tokens.matches1(TokenType3.braceL)) {
          while (!this.tokens.matches1(TokenType3.braceR)) {
            this.tokens.removeToken();
          }
          this.tokens.removeToken();
        } else {
          this.tokens.removeToken();
          if (this.tokens.matches1(TokenType3._as)) {
            this.tokens.removeToken();
            this.tokens.removeToken();
          }
        }
        if (this.tokens.matchesContextual(ContextualKeyword._from) && this.tokens.matches1AtIndex(this.tokens.currentIndex() + 1, TokenType3.string)) {
          this.tokens.removeToken();
          this.tokens.removeToken();
          removeMaybeImportAttributes(this.tokens);
        }
        return true;
      }
      return false;
    }
    processImportEquals() {
      const importName = this.tokens.identifierNameAtIndex(this.tokens.currentIndex() + 1);
      if (this.shouldAutomaticallyElideImportedName(importName)) {
        elideImportEquals(this.tokens);
      } else if (this.injectCreateRequireForImportRequire) {
        this.tokens.replaceToken("const");
        this.tokens.copyToken();
        this.tokens.copyToken();
        this.tokens.replaceToken(this.helperManager.getHelperName("require"));
      } else {
        this.tokens.replaceToken("const");
      }
      return true;
    }
    processImport() {
      if (this.tokens.matches2(TokenType3._import, TokenType3.parenL)) {
        return false;
      }
      const snapshot = this.tokens.snapshot();
      const allImportsRemoved = this.removeImportTypeBindings();
      if (allImportsRemoved) {
        this.tokens.restoreToSnapshot(snapshot);
        while (!this.tokens.matches1(TokenType3.string)) {
          this.tokens.removeToken();
        }
        this.tokens.removeToken();
        removeMaybeImportAttributes(this.tokens);
        if (this.tokens.matches1(TokenType3.semi)) {
          this.tokens.removeToken();
        }
      }
      return true;
    }
    /**
     * Remove type bindings from this import, leaving the rest of the import intact.
     *
     * Return true if this import was ONLY types, and thus is eligible for removal. This will bail out
     * of the replacement operation, so we can return early here.
     */
    removeImportTypeBindings() {
      this.tokens.copyExpectedToken(TokenType3._import);
      if (this.tokens.matchesContextual(ContextualKeyword._type) && !this.tokens.matches1AtIndex(this.tokens.currentIndex() + 1, TokenType3.comma) && !this.tokens.matchesContextualAtIndex(this.tokens.currentIndex() + 1, ContextualKeyword._from)) {
        return true;
      }
      if (this.tokens.matches1(TokenType3.string)) {
        this.tokens.copyToken();
        return false;
      }
      if (this.tokens.matchesContextual(ContextualKeyword._module) && this.tokens.matchesContextualAtIndex(this.tokens.currentIndex() + 2, ContextualKeyword._from)) {
        this.tokens.copyToken();
      }
      let foundNonTypeImport = false;
      let foundAnyNamedImport = false;
      let needsComma = false;
      if (this.tokens.matches1(TokenType3.name)) {
        if (this.shouldAutomaticallyElideImportedName(this.tokens.identifierName())) {
          this.tokens.removeToken();
          if (this.tokens.matches1(TokenType3.comma)) {
            this.tokens.removeToken();
          }
        } else {
          foundNonTypeImport = true;
          this.tokens.copyToken();
          if (this.tokens.matches1(TokenType3.comma)) {
            needsComma = true;
            this.tokens.removeToken();
          }
        }
      }
      if (this.tokens.matches1(TokenType3.star)) {
        if (this.shouldAutomaticallyElideImportedName(this.tokens.identifierNameAtRelativeIndex(2))) {
          this.tokens.removeToken();
          this.tokens.removeToken();
          this.tokens.removeToken();
        } else {
          if (needsComma) {
            this.tokens.appendCode(",");
          }
          foundNonTypeImport = true;
          this.tokens.copyExpectedToken(TokenType3.star);
          this.tokens.copyExpectedToken(TokenType3.name);
          this.tokens.copyExpectedToken(TokenType3.name);
        }
      } else if (this.tokens.matches1(TokenType3.braceL)) {
        if (needsComma) {
          this.tokens.appendCode(",");
        }
        this.tokens.copyToken();
        while (!this.tokens.matches1(TokenType3.braceR)) {
          foundAnyNamedImport = true;
          const specifierInfo = getImportExportSpecifierInfo(this.tokens);
          if (specifierInfo.isType || this.shouldAutomaticallyElideImportedName(specifierInfo.rightName)) {
            while (this.tokens.currentIndex() < specifierInfo.endIndex) {
              this.tokens.removeToken();
            }
            if (this.tokens.matches1(TokenType3.comma)) {
              this.tokens.removeToken();
            }
          } else {
            foundNonTypeImport = true;
            while (this.tokens.currentIndex() < specifierInfo.endIndex) {
              this.tokens.copyToken();
            }
            if (this.tokens.matches1(TokenType3.comma)) {
              this.tokens.copyToken();
            }
          }
        }
        this.tokens.copyExpectedToken(TokenType3.braceR);
      }
      if (this.keepUnusedImports) {
        return false;
      }
      if (this.isTypeScriptTransformEnabled) {
        return !foundNonTypeImport;
      } else if (this.isFlowTransformEnabled) {
        return foundAnyNamedImport && !foundNonTypeImport;
      } else {
        return false;
      }
    }
    shouldAutomaticallyElideImportedName(name) {
      return this.isTypeScriptTransformEnabled && !this.keepUnusedImports && !this.nonTypeIdentifiers.has(name);
    }
    processExportDefault() {
      if (shouldElideDefaultExport(
        this.isTypeScriptTransformEnabled,
        this.keepUnusedImports,
        this.tokens,
        this.declarationInfo
      )) {
        this.tokens.removeInitialToken();
        this.tokens.removeToken();
        this.tokens.removeToken();
        return true;
      }
      const alreadyHasName = this.tokens.matches4(TokenType3._export, TokenType3._default, TokenType3._function, TokenType3.name) || // export default async function
      this.tokens.matches5(TokenType3._export, TokenType3._default, TokenType3.name, TokenType3._function, TokenType3.name) && this.tokens.matchesContextualAtIndex(
        this.tokens.currentIndex() + 2,
        ContextualKeyword._async
      ) || this.tokens.matches4(TokenType3._export, TokenType3._default, TokenType3._class, TokenType3.name) || this.tokens.matches5(TokenType3._export, TokenType3._default, TokenType3._abstract, TokenType3._class, TokenType3.name);
      if (!alreadyHasName && this.reactHotLoaderTransformer) {
        const defaultVarName = this.nameManager.claimFreeName("_default");
        this.tokens.replaceToken(`let ${defaultVarName}; export`);
        this.tokens.copyToken();
        this.tokens.appendCode(` ${defaultVarName} =`);
        this.reactHotLoaderTransformer.setExtractedDefaultExportName(defaultVarName);
        return true;
      }
      return false;
    }
    /**
     * Handle a statement with one of these forms:
     * export {a, type b};
     * export {c, type d} from 'foo';
     *
     * In both cases, any explicit type exports should be removed. In the first
     * case, we also need to handle implicit export elision for names declared as
     * types. In the second case, we must NOT do implicit named export elision,
     * but we must remove the runtime import if all exports are type exports.
     */
    processNamedExports() {
      if (!this.isTypeScriptTransformEnabled) {
        return false;
      }
      this.tokens.copyExpectedToken(TokenType3._export);
      this.tokens.copyExpectedToken(TokenType3.braceL);
      const isReExport = isExportFrom(this.tokens);
      let foundNonTypeExport = false;
      while (!this.tokens.matches1(TokenType3.braceR)) {
        const specifierInfo = getImportExportSpecifierInfo(this.tokens);
        if (specifierInfo.isType || !isReExport && this.shouldElideExportedName(specifierInfo.leftName)) {
          while (this.tokens.currentIndex() < specifierInfo.endIndex) {
            this.tokens.removeToken();
          }
          if (this.tokens.matches1(TokenType3.comma)) {
            this.tokens.removeToken();
          }
        } else {
          foundNonTypeExport = true;
          while (this.tokens.currentIndex() < specifierInfo.endIndex) {
            this.tokens.copyToken();
          }
          if (this.tokens.matches1(TokenType3.comma)) {
            this.tokens.copyToken();
          }
        }
      }
      this.tokens.copyExpectedToken(TokenType3.braceR);
      if (!this.keepUnusedImports && isReExport && !foundNonTypeExport) {
        this.tokens.removeToken();
        this.tokens.removeToken();
        removeMaybeImportAttributes(this.tokens);
      }
      return true;
    }
    /**
     * ESM elides all imports with the rule that we only elide if we see that it's
     * a type and never see it as a value. This is in contrast to CJS, which
     * elides imports that are completely unknown.
     */
    shouldElideExportedName(name) {
      return this.isTypeScriptTransformEnabled && !this.keepUnusedImports && this.declarationInfo.typeDeclarations.has(name) && !this.declarationInfo.valueDeclarations.has(name);
    }
  };

  // node_modules/sucrase/dist/esm/transformers/FlowTransformer.js
  var FlowTransformer = class extends Transformer {
    constructor(rootTransformer, tokens, isImportsTransformEnabled) {
      super();
      this.rootTransformer = rootTransformer;
      this.tokens = tokens;
      this.isImportsTransformEnabled = isImportsTransformEnabled;
      ;
    }
    process() {
      if (this.rootTransformer.processPossibleArrowParamEnd() || this.rootTransformer.processPossibleAsyncArrowWithTypeParams() || this.rootTransformer.processPossibleTypeRange()) {
        return true;
      }
      if (this.tokens.matches1(TokenType3._enum)) {
        this.processEnum();
        return true;
      }
      if (this.tokens.matches2(TokenType3._export, TokenType3._enum)) {
        this.processNamedExportEnum();
        return true;
      }
      if (this.tokens.matches3(TokenType3._export, TokenType3._default, TokenType3._enum)) {
        this.processDefaultExportEnum();
        return true;
      }
      return false;
    }
    /**
     * Handle a declaration like:
     * export enum E ...
     *
     * With this imports transform, this becomes:
     * const E = [[enum]]; exports.E = E;
     *
     * otherwise, it becomes:
     * export const E = [[enum]];
     */
    processNamedExportEnum() {
      if (this.isImportsTransformEnabled) {
        this.tokens.removeInitialToken();
        const enumName = this.tokens.identifierNameAtRelativeIndex(1);
        this.processEnum();
        this.tokens.appendCode(` exports.${enumName} = ${enumName};`);
      } else {
        this.tokens.copyToken();
        this.processEnum();
      }
    }
    /**
     * Handle a declaration like:
     * export default enum E
     *
     * With the imports transform, this becomes:
     * const E = [[enum]]; exports.default = E;
     *
     * otherwise, it becomes:
     * const E = [[enum]]; export default E;
     */
    processDefaultExportEnum() {
      this.tokens.removeInitialToken();
      this.tokens.removeToken();
      const enumName = this.tokens.identifierNameAtRelativeIndex(1);
      this.processEnum();
      if (this.isImportsTransformEnabled) {
        this.tokens.appendCode(` exports.default = ${enumName};`);
      } else {
        this.tokens.appendCode(` export default ${enumName};`);
      }
    }
    /**
     * Transpile flow enums to invoke the "flow-enums-runtime" library.
     *
     * Currently, the transpiled code always uses `require("flow-enums-runtime")`,
     * but if future flexibility is needed, we could expose a config option for
     * this string (similar to configurable JSX). Even when targeting ESM, the
     * default behavior of babel-plugin-transform-flow-enums is to use require
     * rather than injecting an import.
     *
     * Flow enums are quite a bit simpler than TS enums and have some convenient
     * constraints:
     * - Element initializers must be either always present or always absent. That
     *   means that we can use fixed lookahead on the first element (if any) and
     *   assume that all elements are like that.
     * - The right-hand side of an element initializer must be a literal value,
     *   not a complex expression and not referencing other elements. That means
     *   we can simply copy a single token.
     *
     * Enums can be broken up into three basic cases:
     *
     * Mirrored enums:
     * enum E {A, B}
     *   ->
     * const E = require("flow-enums-runtime").Mirrored(["A", "B"]);
     *
     * Initializer enums:
     * enum E {A = 1, B = 2}
     *   ->
     * const E = require("flow-enums-runtime")({A: 1, B: 2});
     *
     * Symbol enums:
     * enum E of symbol {A, B}
     *   ->
     * const E = require("flow-enums-runtime")({A: Symbol("A"), B: Symbol("B")});
     *
     * We can statically detect which of the three cases this is by looking at the
     * "of" declaration (if any) and seeing if the first element has an initializer.
     * Since the other transform details are so similar between the three cases, we
     * use a single implementation and vary the transform within processEnumElement
     * based on case.
     */
    processEnum() {
      this.tokens.replaceToken("const");
      this.tokens.copyExpectedToken(TokenType3.name);
      let isSymbolEnum = false;
      if (this.tokens.matchesContextual(ContextualKeyword._of)) {
        this.tokens.removeToken();
        isSymbolEnum = this.tokens.matchesContextual(ContextualKeyword._symbol);
        this.tokens.removeToken();
      }
      const hasInitializers = this.tokens.matches3(TokenType3.braceL, TokenType3.name, TokenType3.eq);
      this.tokens.appendCode(' = require("flow-enums-runtime")');
      const isMirrored = !isSymbolEnum && !hasInitializers;
      this.tokens.replaceTokenTrimmingLeftWhitespace(isMirrored ? ".Mirrored([" : "({");
      while (!this.tokens.matches1(TokenType3.braceR)) {
        if (this.tokens.matches1(TokenType3.ellipsis)) {
          this.tokens.removeToken();
          break;
        }
        this.processEnumElement(isSymbolEnum, hasInitializers);
        if (this.tokens.matches1(TokenType3.comma)) {
          this.tokens.copyToken();
        }
      }
      this.tokens.replaceToken(isMirrored ? "]);" : "});");
    }
    /**
     * Process an individual enum element, producing either an array element or an
     * object element based on what type of enum this is.
     */
    processEnumElement(isSymbolEnum, hasInitializers) {
      if (isSymbolEnum) {
        const elementName = this.tokens.identifierName();
        this.tokens.copyToken();
        this.tokens.appendCode(`: Symbol("${elementName}")`);
      } else if (hasInitializers) {
        this.tokens.copyToken();
        this.tokens.replaceTokenTrimmingLeftWhitespace(":");
        this.tokens.copyToken();
      } else {
        this.tokens.replaceToken(`"${this.tokens.identifierName()}"`);
      }
    }
  };

  // node_modules/sucrase/dist/esm/transformers/JestHoistTransformer.js
  function _optionalChain(ops) {
    let lastAccessLHS = void 0;
    let value = ops[0];
    let i = 1;
    while (i < ops.length) {
      const op = ops[i];
      const fn = ops[i + 1];
      i += 2;
      if ((op === "optionalAccess" || op === "optionalCall") && value == null) {
        return void 0;
      }
      if (op === "access" || op === "optionalAccess") {
        lastAccessLHS = value;
        value = fn(value);
      } else if (op === "call" || op === "optionalCall") {
        value = fn((...args) => value.call(lastAccessLHS, ...args));
        lastAccessLHS = void 0;
      }
    }
    return value;
  }
  var JEST_GLOBAL_NAME = "jest";
  var HOISTED_METHODS = ["mock", "unmock", "enableAutomock", "disableAutomock"];
  var JestHoistTransformer = class _JestHoistTransformer extends Transformer {
    __init() {
      this.hoistedFunctionNames = [];
    }
    constructor(rootTransformer, tokens, nameManager, importProcessor) {
      super();
      this.rootTransformer = rootTransformer;
      this.tokens = tokens;
      this.nameManager = nameManager;
      this.importProcessor = importProcessor;
      _JestHoistTransformer.prototype.__init.call(this);
      ;
    }
    process() {
      if (this.tokens.currentToken().scopeDepth === 0 && this.tokens.matches4(TokenType3.name, TokenType3.dot, TokenType3.name, TokenType3.parenL) && this.tokens.identifierName() === JEST_GLOBAL_NAME) {
        if (_optionalChain([this, "access", (_) => _.importProcessor, "optionalAccess", (_2) => _2.getGlobalNames, "call", (_3) => _3(), "optionalAccess", (_4) => _4.has, "call", (_5) => _5(JEST_GLOBAL_NAME)])) {
          return false;
        }
        return this.extractHoistedCalls();
      }
      return false;
    }
    getHoistedCode() {
      if (this.hoistedFunctionNames.length > 0) {
        return this.hoistedFunctionNames.map((name) => `${name}();`).join("");
      }
      return "";
    }
    /**
     * Extracts any methods calls on the jest-object that should be hoisted.
     *
     * According to the jest docs, https://jestjs.io/docs/en/jest-object#jestmockmodulename-factory-options,
     * mock, unmock, enableAutomock, disableAutomock, are the methods that should be hoisted.
     *
     * We do not apply the same checks of the arguments as babel-plugin-jest-hoist does.
     */
    extractHoistedCalls() {
      this.tokens.removeToken();
      let followsNonHoistedJestCall = false;
      while (this.tokens.matches3(TokenType3.dot, TokenType3.name, TokenType3.parenL)) {
        const methodName = this.tokens.identifierNameAtIndex(this.tokens.currentIndex() + 1);
        const shouldHoist = HOISTED_METHODS.includes(methodName);
        if (shouldHoist) {
          const hoistedFunctionName = this.nameManager.claimFreeName("__jestHoist");
          this.hoistedFunctionNames.push(hoistedFunctionName);
          this.tokens.replaceToken(`function ${hoistedFunctionName}(){${JEST_GLOBAL_NAME}.`);
          this.tokens.copyToken();
          this.tokens.copyToken();
          this.rootTransformer.processBalancedCode();
          this.tokens.copyExpectedToken(TokenType3.parenR);
          this.tokens.appendCode(";}");
          followsNonHoistedJestCall = false;
        } else {
          if (followsNonHoistedJestCall) {
            this.tokens.copyToken();
          } else {
            this.tokens.replaceToken(`${JEST_GLOBAL_NAME}.`);
          }
          this.tokens.copyToken();
          this.tokens.copyToken();
          this.rootTransformer.processBalancedCode();
          this.tokens.copyExpectedToken(TokenType3.parenR);
          followsNonHoistedJestCall = true;
        }
      }
      return true;
    }
  };

  // node_modules/sucrase/dist/esm/transformers/NumericSeparatorTransformer.js
  var NumericSeparatorTransformer = class extends Transformer {
    constructor(tokens) {
      super();
      this.tokens = tokens;
      ;
    }
    process() {
      if (this.tokens.matches1(TokenType3.num)) {
        const code = this.tokens.currentTokenCode();
        if (code.includes("_")) {
          this.tokens.replaceToken(code.replace(/_/g, ""));
          return true;
        }
      }
      return false;
    }
  };

  // node_modules/sucrase/dist/esm/transformers/OptionalCatchBindingTransformer.js
  var OptionalCatchBindingTransformer = class extends Transformer {
    constructor(tokens, nameManager) {
      super();
      this.tokens = tokens;
      this.nameManager = nameManager;
      ;
    }
    process() {
      if (this.tokens.matches2(TokenType3._catch, TokenType3.braceL)) {
        this.tokens.copyToken();
        this.tokens.appendCode(` (${this.nameManager.claimFreeName("e")})`);
        return true;
      }
      return false;
    }
  };

  // node_modules/sucrase/dist/esm/transformers/OptionalChainingNullishTransformer.js
  var OptionalChainingNullishTransformer = class extends Transformer {
    constructor(tokens, nameManager) {
      super();
      this.tokens = tokens;
      this.nameManager = nameManager;
      ;
    }
    process() {
      if (this.tokens.matches1(TokenType3.nullishCoalescing)) {
        const token2 = this.tokens.currentToken();
        if (this.tokens.tokens[token2.nullishStartIndex].isAsyncOperation) {
          this.tokens.replaceTokenTrimmingLeftWhitespace(", async () => (");
        } else {
          this.tokens.replaceTokenTrimmingLeftWhitespace(", () => (");
        }
        return true;
      }
      if (this.tokens.matches1(TokenType3._delete)) {
        const nextToken2 = this.tokens.tokenAtRelativeIndex(1);
        if (nextToken2.isOptionalChainStart) {
          this.tokens.removeInitialToken();
          return true;
        }
      }
      const token = this.tokens.currentToken();
      const chainStart = token.subscriptStartIndex;
      if (chainStart != null && this.tokens.tokens[chainStart].isOptionalChainStart && // Super subscripts can't be optional (since super is never null/undefined), and the syntax
      // relies on the subscript being intact, so leave this token alone.
      this.tokens.tokenAtRelativeIndex(-1).type !== TokenType3._super) {
        const param = this.nameManager.claimFreeName("_");
        let arrowStartSnippet;
        if (chainStart > 0 && this.tokens.matches1AtIndex(chainStart - 1, TokenType3._delete) && this.isLastSubscriptInChain()) {
          arrowStartSnippet = `${param} => delete ${param}`;
        } else {
          arrowStartSnippet = `${param} => ${param}`;
        }
        if (this.tokens.tokens[chainStart].isAsyncOperation) {
          arrowStartSnippet = `async ${arrowStartSnippet}`;
        }
        if (this.tokens.matches2(TokenType3.questionDot, TokenType3.parenL) || this.tokens.matches2(TokenType3.questionDot, TokenType3.lessThan)) {
          if (this.justSkippedSuper()) {
            this.tokens.appendCode(".bind(this)");
          }
          this.tokens.replaceTokenTrimmingLeftWhitespace(`, 'optionalCall', ${arrowStartSnippet}`);
        } else if (this.tokens.matches2(TokenType3.questionDot, TokenType3.bracketL)) {
          this.tokens.replaceTokenTrimmingLeftWhitespace(`, 'optionalAccess', ${arrowStartSnippet}`);
        } else if (this.tokens.matches1(TokenType3.questionDot)) {
          this.tokens.replaceTokenTrimmingLeftWhitespace(`, 'optionalAccess', ${arrowStartSnippet}.`);
        } else if (this.tokens.matches1(TokenType3.dot)) {
          this.tokens.replaceTokenTrimmingLeftWhitespace(`, 'access', ${arrowStartSnippet}.`);
        } else if (this.tokens.matches1(TokenType3.bracketL)) {
          this.tokens.replaceTokenTrimmingLeftWhitespace(`, 'access', ${arrowStartSnippet}[`);
        } else if (this.tokens.matches1(TokenType3.parenL)) {
          if (this.justSkippedSuper()) {
            this.tokens.appendCode(".bind(this)");
          }
          this.tokens.replaceTokenTrimmingLeftWhitespace(`, 'call', ${arrowStartSnippet}(`);
        } else {
          throw new Error("Unexpected subscript operator in optional chain.");
        }
        return true;
      }
      return false;
    }
    /**
     * Determine if the current token is the last of its chain, so that we know whether it's eligible
     * to have a delete op inserted.
     *
     * We can do this by walking forward until we determine one way or another. Each
     * isOptionalChainStart token must be paired with exactly one isOptionalChainEnd token after it in
     * a nesting way, so we can track depth and walk to the end of the chain (the point where the
     * depth goes negative) and see if any other subscript token is after us in the chain.
     */
    isLastSubscriptInChain() {
      let depth = 0;
      for (let i = this.tokens.currentIndex() + 1; ; i++) {
        if (i >= this.tokens.tokens.length) {
          throw new Error("Reached the end of the code while finding the end of the access chain.");
        }
        if (this.tokens.tokens[i].isOptionalChainStart) {
          depth++;
        } else if (this.tokens.tokens[i].isOptionalChainEnd) {
          depth--;
        }
        if (depth < 0) {
          return true;
        }
        if (depth === 0 && this.tokens.tokens[i].subscriptStartIndex != null) {
          return false;
        }
      }
    }
    /**
     * Determine if we are the open-paren in an expression like super.a()?.b.
     *
     * We can do this by walking backward to find the previous subscript. If that subscript was
     * preceded by a super, then we must be the subscript after it, so if this is a call expression,
     * we'll need to attach the right context.
     */
    justSkippedSuper() {
      let depth = 0;
      let index = this.tokens.currentIndex() - 1;
      while (true) {
        if (index < 0) {
          throw new Error(
            "Reached the start of the code while finding the start of the access chain."
          );
        }
        if (this.tokens.tokens[index].isOptionalChainStart) {
          depth--;
        } else if (this.tokens.tokens[index].isOptionalChainEnd) {
          depth++;
        }
        if (depth < 0) {
          return false;
        }
        if (depth === 0 && this.tokens.tokens[index].subscriptStartIndex != null) {
          return this.tokens.tokens[index - 1].type === TokenType3._super;
        }
        index--;
      }
    }
  };

  // node_modules/sucrase/dist/esm/transformers/ReactDisplayNameTransformer.js
  var ReactDisplayNameTransformer = class extends Transformer {
    constructor(rootTransformer, tokens, importProcessor, options) {
      super();
      this.rootTransformer = rootTransformer;
      this.tokens = tokens;
      this.importProcessor = importProcessor;
      this.options = options;
      ;
    }
    process() {
      const startIndex = this.tokens.currentIndex();
      if (this.tokens.identifierName() === "createReactClass") {
        const newName = this.importProcessor && this.importProcessor.getIdentifierReplacement("createReactClass");
        if (newName) {
          this.tokens.replaceToken(`(0, ${newName})`);
        } else {
          this.tokens.copyToken();
        }
        this.tryProcessCreateClassCall(startIndex);
        return true;
      }
      if (this.tokens.matches3(TokenType3.name, TokenType3.dot, TokenType3.name) && this.tokens.identifierName() === "React" && this.tokens.identifierNameAtIndex(this.tokens.currentIndex() + 2) === "createClass") {
        const newName = this.importProcessor ? this.importProcessor.getIdentifierReplacement("React") || "React" : "React";
        if (newName) {
          this.tokens.replaceToken(newName);
          this.tokens.copyToken();
          this.tokens.copyToken();
        } else {
          this.tokens.copyToken();
          this.tokens.copyToken();
          this.tokens.copyToken();
        }
        this.tryProcessCreateClassCall(startIndex);
        return true;
      }
      return false;
    }
    /**
     * This is called with the token position at the open-paren.
     */
    tryProcessCreateClassCall(startIndex) {
      const displayName = this.findDisplayName(startIndex);
      if (!displayName) {
        return;
      }
      if (this.classNeedsDisplayName()) {
        this.tokens.copyExpectedToken(TokenType3.parenL);
        this.tokens.copyExpectedToken(TokenType3.braceL);
        this.tokens.appendCode(`displayName: '${displayName}',`);
        this.rootTransformer.processBalancedCode();
        this.tokens.copyExpectedToken(TokenType3.braceR);
        this.tokens.copyExpectedToken(TokenType3.parenR);
      }
    }
    findDisplayName(startIndex) {
      if (startIndex < 2) {
        return null;
      }
      if (this.tokens.matches2AtIndex(startIndex - 2, TokenType3.name, TokenType3.eq)) {
        return this.tokens.identifierNameAtIndex(startIndex - 2);
      }
      if (startIndex >= 2 && this.tokens.tokens[startIndex - 2].identifierRole === IdentifierRole.ObjectKey) {
        return this.tokens.identifierNameAtIndex(startIndex - 2);
      }
      if (this.tokens.matches2AtIndex(startIndex - 2, TokenType3._export, TokenType3._default)) {
        return this.getDisplayNameFromFilename();
      }
      return null;
    }
    getDisplayNameFromFilename() {
      const filePath = this.options.filePath || "unknown";
      const pathSegments = filePath.split("/");
      const filename = pathSegments[pathSegments.length - 1];
      const dotIndex = filename.lastIndexOf(".");
      const baseFilename = dotIndex === -1 ? filename : filename.slice(0, dotIndex);
      if (baseFilename === "index" && pathSegments[pathSegments.length - 2]) {
        return pathSegments[pathSegments.length - 2];
      } else {
        return baseFilename;
      }
    }
    /**
     * We only want to add a display name when this is a function call containing
     * one argument, which is an object literal without `displayName` as an
     * existing key.
     */
    classNeedsDisplayName() {
      let index = this.tokens.currentIndex();
      if (!this.tokens.matches2(TokenType3.parenL, TokenType3.braceL)) {
        return false;
      }
      const objectStartIndex = index + 1;
      const objectContextId = this.tokens.tokens[objectStartIndex].contextId;
      if (objectContextId == null) {
        throw new Error("Expected non-null context ID on object open-brace.");
      }
      for (; index < this.tokens.tokens.length; index++) {
        const token = this.tokens.tokens[index];
        if (token.type === TokenType3.braceR && token.contextId === objectContextId) {
          index++;
          break;
        }
        if (this.tokens.identifierNameAtIndex(index) === "displayName" && this.tokens.tokens[index].identifierRole === IdentifierRole.ObjectKey && token.contextId === objectContextId) {
          return false;
        }
      }
      if (index === this.tokens.tokens.length) {
        throw new Error("Unexpected end of input when processing React class.");
      }
      return this.tokens.matches1AtIndex(index, TokenType3.parenR) || this.tokens.matches2AtIndex(index, TokenType3.comma, TokenType3.parenR);
    }
  };

  // node_modules/sucrase/dist/esm/transformers/ReactHotLoaderTransformer.js
  var ReactHotLoaderTransformer = class _ReactHotLoaderTransformer extends Transformer {
    __init() {
      this.extractedDefaultExportName = null;
    }
    constructor(tokens, filePath) {
      super();
      this.tokens = tokens;
      this.filePath = filePath;
      _ReactHotLoaderTransformer.prototype.__init.call(this);
      ;
    }
    setExtractedDefaultExportName(extractedDefaultExportName) {
      this.extractedDefaultExportName = extractedDefaultExportName;
    }
    getPrefixCode() {
      return `
      (function () {
        var enterModule = require('react-hot-loader').enterModule;
        enterModule && enterModule(module);
      })();`.replace(/\s+/g, " ").trim();
    }
    getSuffixCode() {
      const topLevelNames = /* @__PURE__ */ new Set();
      for (const token of this.tokens.tokens) {
        if (!token.isType && isTopLevelDeclaration(token) && token.identifierRole !== IdentifierRole.ImportDeclaration) {
          topLevelNames.add(this.tokens.identifierNameForToken(token));
        }
      }
      const namesToRegister = Array.from(topLevelNames).map((name) => ({
        variableName: name,
        uniqueLocalName: name
      }));
      if (this.extractedDefaultExportName) {
        namesToRegister.push({
          variableName: this.extractedDefaultExportName,
          uniqueLocalName: "default"
        });
      }
      return `
;(function () {
  var reactHotLoader = require('react-hot-loader').default;
  var leaveModule = require('react-hot-loader').leaveModule;
  if (!reactHotLoader) {
    return;
  }
${namesToRegister.map(
        ({ variableName, uniqueLocalName }) => `  reactHotLoader.register(${variableName}, "${uniqueLocalName}", ${JSON.stringify(
          this.filePath || ""
        )});`
      ).join("\n")}
  leaveModule(module);
})();`;
    }
    process() {
      return false;
    }
  };

  // node_modules/sucrase/dist/esm/util/isIdentifier.js
  var RESERVED_WORDS = /* @__PURE__ */ new Set([
    // Reserved keywords as of ECMAScript 2015
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "debugger",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "finally",
    "for",
    "function",
    "if",
    "import",
    "in",
    "instanceof",
    "new",
    "return",
    "super",
    "switch",
    "this",
    "throw",
    "try",
    "typeof",
    "var",
    "void",
    "while",
    "with",
    "yield",
    // Future reserved keywords
    "enum",
    "implements",
    "interface",
    "let",
    "package",
    "private",
    "protected",
    "public",
    "static",
    "await",
    // Literals that cannot be used as identifiers
    "false",
    "null",
    "true"
  ]);
  function isIdentifier(name) {
    if (name.length === 0) {
      return false;
    }
    if (!IS_IDENTIFIER_START[name.charCodeAt(0)]) {
      return false;
    }
    for (let i = 1; i < name.length; i++) {
      if (!IS_IDENTIFIER_CHAR[name.charCodeAt(i)]) {
        return false;
      }
    }
    return !RESERVED_WORDS.has(name);
  }

  // node_modules/sucrase/dist/esm/transformers/TypeScriptTransformer.js
  var TypeScriptTransformer = class extends Transformer {
    constructor(rootTransformer, tokens, isImportsTransformEnabled) {
      super();
      this.rootTransformer = rootTransformer;
      this.tokens = tokens;
      this.isImportsTransformEnabled = isImportsTransformEnabled;
      ;
    }
    process() {
      if (this.rootTransformer.processPossibleArrowParamEnd() || this.rootTransformer.processPossibleAsyncArrowWithTypeParams() || this.rootTransformer.processPossibleTypeRange()) {
        return true;
      }
      if (this.tokens.matches1(TokenType3._public) || this.tokens.matches1(TokenType3._protected) || this.tokens.matches1(TokenType3._private) || this.tokens.matches1(TokenType3._abstract) || this.tokens.matches1(TokenType3._readonly) || this.tokens.matches1(TokenType3._override) || this.tokens.matches1(TokenType3.nonNullAssertion)) {
        this.tokens.removeInitialToken();
        return true;
      }
      if (this.tokens.matches1(TokenType3._enum) || this.tokens.matches2(TokenType3._const, TokenType3._enum)) {
        this.processEnum();
        return true;
      }
      if (this.tokens.matches2(TokenType3._export, TokenType3._enum) || this.tokens.matches3(TokenType3._export, TokenType3._const, TokenType3._enum)) {
        this.processEnum(true);
        return true;
      }
      return false;
    }
    processEnum(isExport = false) {
      this.tokens.removeInitialToken();
      while (this.tokens.matches1(TokenType3._const) || this.tokens.matches1(TokenType3._enum)) {
        this.tokens.removeToken();
      }
      const enumName = this.tokens.identifierName();
      this.tokens.removeToken();
      if (isExport && !this.isImportsTransformEnabled) {
        this.tokens.appendCode("export ");
      }
      this.tokens.appendCode(`var ${enumName}; (function (${enumName})`);
      this.tokens.copyExpectedToken(TokenType3.braceL);
      this.processEnumBody(enumName);
      this.tokens.copyExpectedToken(TokenType3.braceR);
      if (isExport && this.isImportsTransformEnabled) {
        this.tokens.appendCode(`)(${enumName} || (exports.${enumName} = ${enumName} = {}));`);
      } else {
        this.tokens.appendCode(`)(${enumName} || (${enumName} = {}));`);
      }
    }
    /**
     * Transform an enum into equivalent JS. This has complexity in a few places:
     * - TS allows string enums, numeric enums, and a mix of the two styles within an enum.
     * - Enum keys are allowed to be referenced in later enum values.
     * - Enum keys are allowed to be strings.
     * - When enum values are omitted, they should follow an auto-increment behavior.
     */
    processEnumBody(enumName) {
      let previousValueCode = null;
      while (true) {
        if (this.tokens.matches1(TokenType3.braceR)) {
          break;
        }
        const { nameStringCode, variableName } = this.extractEnumKeyInfo(this.tokens.currentToken());
        this.tokens.removeInitialToken();
        if (this.tokens.matches3(TokenType3.eq, TokenType3.string, TokenType3.comma) || this.tokens.matches3(TokenType3.eq, TokenType3.string, TokenType3.braceR)) {
          this.processStringLiteralEnumMember(enumName, nameStringCode, variableName);
        } else if (this.tokens.matches1(TokenType3.eq)) {
          this.processExplicitValueEnumMember(enumName, nameStringCode, variableName);
        } else {
          this.processImplicitValueEnumMember(
            enumName,
            nameStringCode,
            variableName,
            previousValueCode
          );
        }
        if (this.tokens.matches1(TokenType3.comma)) {
          this.tokens.removeToken();
        }
        if (variableName != null) {
          previousValueCode = variableName;
        } else {
          previousValueCode = `${enumName}[${nameStringCode}]`;
        }
      }
    }
    /**
     * Detect name information about this enum key, which will be used to determine which code to emit
     * and whether we should declare a variable as part of this declaration.
     *
     * Some cases to keep in mind:
     * - Enum keys can be implicitly referenced later, e.g. `X = 1, Y = X`. In Sucrase, we implement
     *   this by declaring a variable `X` so that later expressions can use it.
     * - In addition to the usual identifier key syntax, enum keys are allowed to be string literals,
     *   e.g. `"hello world" = 3,`. Template literal syntax is NOT allowed.
     * - Even if the enum key is defined as a string literal, it may still be referenced by identifier
     *   later, e.g. `"X" = 1, Y = X`. That means that we need to detect whether or not a string
     *   literal is identifier-like and emit a variable if so, even if the declaration did not use an
     *   identifier.
     * - Reserved keywords like `break` are valid enum keys, but are not valid to be referenced later
     *   and would be a syntax error if we emitted a variable, so we need to skip the variable
     *   declaration in those cases.
     *
     * The variableName return value captures these nuances: if non-null, we can and must emit a
     * variable declaration, and if null, we can't and shouldn't.
     */
    extractEnumKeyInfo(nameToken) {
      if (nameToken.type === TokenType3.name) {
        const name = this.tokens.identifierNameForToken(nameToken);
        return {
          nameStringCode: `"${name}"`,
          variableName: isIdentifier(name) ? name : null
        };
      } else if (nameToken.type === TokenType3.string) {
        const name = this.tokens.stringValueForToken(nameToken);
        return {
          nameStringCode: this.tokens.code.slice(nameToken.start, nameToken.end),
          variableName: isIdentifier(name) ? name : null
        };
      } else {
        throw new Error("Expected name or string at beginning of enum element.");
      }
    }
    /**
     * Handle an enum member where the RHS is just a string literal (not omitted, not a number, and
     * not a complex expression). This is the typical form for TS string enums, and in this case, we
     * do *not* create a reverse mapping.
     *
     * This is called after deleting the key token, when the token processor is at the equals sign.
     *
     * Example 1:
     * someKey = "some value"
     * ->
     * const someKey = "some value"; MyEnum["someKey"] = someKey;
     *
     * Example 2:
     * "some key" = "some value"
     * ->
     * MyEnum["some key"] = "some value";
     */
    processStringLiteralEnumMember(enumName, nameStringCode, variableName) {
      if (variableName != null) {
        this.tokens.appendCode(`const ${variableName}`);
        this.tokens.copyToken();
        this.tokens.copyToken();
        this.tokens.appendCode(`; ${enumName}[${nameStringCode}] = ${variableName};`);
      } else {
        this.tokens.appendCode(`${enumName}[${nameStringCode}]`);
        this.tokens.copyToken();
        this.tokens.copyToken();
        this.tokens.appendCode(";");
      }
    }
    /**
     * Handle an enum member initialized with an expression on the right-hand side (other than a
     * string literal). In these cases, we should transform the expression and emit code that sets up
     * a reverse mapping.
     *
     * The TypeScript implementation of this operation distinguishes between expressions that can be
     * "constant folded" at compile time (i.e. consist of number literals and simple math operations
     * on those numbers) and ones that are dynamic. For constant expressions, it emits the resolved
     * numeric value, and auto-incrementing is only allowed in that case. Evaluating expressions at
     * compile time would add significant complexity to Sucrase, so Sucrase instead leaves the
     * expression as-is, and will later emit something like `MyEnum["previousKey"] + 1` to implement
     * auto-incrementing.
     *
     * This is called after deleting the key token, when the token processor is at the equals sign.
     *
     * Example 1:
     * someKey = 1 + 1
     * ->
     * const someKey = 1 + 1; MyEnum[MyEnum["someKey"] = someKey] = "someKey";
     *
     * Example 2:
     * "some key" = 1 + 1
     * ->
     * MyEnum[MyEnum["some key"] = 1 + 1] = "some key";
     */
    processExplicitValueEnumMember(enumName, nameStringCode, variableName) {
      const rhsEndIndex = this.tokens.currentToken().rhsEndIndex;
      if (rhsEndIndex == null) {
        throw new Error("Expected rhsEndIndex on enum assign.");
      }
      if (variableName != null) {
        this.tokens.appendCode(`const ${variableName}`);
        this.tokens.copyToken();
        while (this.tokens.currentIndex() < rhsEndIndex) {
          this.rootTransformer.processToken();
        }
        this.tokens.appendCode(
          `; ${enumName}[${enumName}[${nameStringCode}] = ${variableName}] = ${nameStringCode};`
        );
      } else {
        this.tokens.appendCode(`${enumName}[${enumName}[${nameStringCode}]`);
        this.tokens.copyToken();
        while (this.tokens.currentIndex() < rhsEndIndex) {
          this.rootTransformer.processToken();
        }
        this.tokens.appendCode(`] = ${nameStringCode};`);
      }
    }
    /**
     * Handle an enum member with no right-hand side expression. In this case, the value is the
     * previous value plus 1, or 0 if there was no previous value. We should also always emit a
     * reverse mapping.
     *
     * Example 1:
     * someKey2
     * ->
     * const someKey2 = someKey1 + 1; MyEnum[MyEnum["someKey2"] = someKey2] = "someKey2";
     *
     * Example 2:
     * "some key 2"
     * ->
     * MyEnum[MyEnum["some key 2"] = someKey1 + 1] = "some key 2";
     */
    processImplicitValueEnumMember(enumName, nameStringCode, variableName, previousValueCode) {
      let valueCode = previousValueCode != null ? `${previousValueCode} + 1` : "0";
      if (variableName != null) {
        this.tokens.appendCode(`const ${variableName} = ${valueCode}; `);
        valueCode = variableName;
      }
      this.tokens.appendCode(
        `${enumName}[${enumName}[${nameStringCode}] = ${valueCode}] = ${nameStringCode};`
      );
    }
  };

  // node_modules/sucrase/dist/esm/transformers/RootTransformer.js
  var RootTransformer = class _RootTransformer {
    __init() {
      this.transformers = [];
    }
    __init2() {
      this.generatedVariables = [];
    }
    constructor(sucraseContext, transforms, enableLegacyBabel5ModuleInterop, options) {
      ;
      _RootTransformer.prototype.__init.call(this);
      _RootTransformer.prototype.__init2.call(this);
      this.nameManager = sucraseContext.nameManager;
      this.helperManager = sucraseContext.helperManager;
      const { tokenProcessor, importProcessor } = sucraseContext;
      this.tokens = tokenProcessor;
      this.isImportsTransformEnabled = transforms.includes("imports");
      this.isReactHotLoaderTransformEnabled = transforms.includes("react-hot-loader");
      this.disableESTransforms = Boolean(options.disableESTransforms);
      if (!options.disableESTransforms) {
        this.transformers.push(
          new OptionalChainingNullishTransformer(tokenProcessor, this.nameManager)
        );
        this.transformers.push(new NumericSeparatorTransformer(tokenProcessor));
        this.transformers.push(new OptionalCatchBindingTransformer(tokenProcessor, this.nameManager));
      }
      if (transforms.includes("jsx")) {
        if (options.jsxRuntime !== "preserve") {
          this.transformers.push(
            new JSXTransformer(this, tokenProcessor, importProcessor, this.nameManager, options)
          );
        }
        this.transformers.push(
          new ReactDisplayNameTransformer(this, tokenProcessor, importProcessor, options)
        );
      }
      let reactHotLoaderTransformer = null;
      if (transforms.includes("react-hot-loader")) {
        if (!options.filePath) {
          throw new Error("filePath is required when using the react-hot-loader transform.");
        }
        reactHotLoaderTransformer = new ReactHotLoaderTransformer(tokenProcessor, options.filePath);
        this.transformers.push(reactHotLoaderTransformer);
      }
      if (transforms.includes("imports")) {
        if (importProcessor === null) {
          throw new Error("Expected non-null importProcessor with imports transform enabled.");
        }
        this.transformers.push(
          new CJSImportTransformer(
            this,
            tokenProcessor,
            importProcessor,
            this.nameManager,
            this.helperManager,
            reactHotLoaderTransformer,
            enableLegacyBabel5ModuleInterop,
            Boolean(options.enableLegacyTypeScriptModuleInterop),
            transforms.includes("typescript"),
            transforms.includes("flow"),
            Boolean(options.preserveDynamicImport),
            Boolean(options.keepUnusedImports)
          )
        );
      } else {
        this.transformers.push(
          new ESMImportTransformer(
            tokenProcessor,
            this.nameManager,
            this.helperManager,
            reactHotLoaderTransformer,
            transforms.includes("typescript"),
            transforms.includes("flow"),
            Boolean(options.keepUnusedImports),
            options
          )
        );
      }
      if (transforms.includes("flow")) {
        this.transformers.push(
          new FlowTransformer(this, tokenProcessor, transforms.includes("imports"))
        );
      }
      if (transforms.includes("typescript")) {
        this.transformers.push(
          new TypeScriptTransformer(this, tokenProcessor, transforms.includes("imports"))
        );
      }
      if (transforms.includes("jest")) {
        this.transformers.push(
          new JestHoistTransformer(this, tokenProcessor, this.nameManager, importProcessor)
        );
      }
    }
    transform() {
      this.tokens.reset();
      this.processBalancedCode();
      const shouldAddUseStrict = this.isImportsTransformEnabled;
      let prefix = shouldAddUseStrict ? '"use strict";' : "";
      for (const transformer of this.transformers) {
        prefix += transformer.getPrefixCode();
      }
      prefix += this.helperManager.emitHelpers();
      prefix += this.generatedVariables.map((v) => ` var ${v};`).join("");
      for (const transformer of this.transformers) {
        prefix += transformer.getHoistedCode();
      }
      let suffix = "";
      for (const transformer of this.transformers) {
        suffix += transformer.getSuffixCode();
      }
      const result = this.tokens.finish();
      let { code } = result;
      if (code.startsWith("#!")) {
        let newlineIndex = code.indexOf("\n");
        if (newlineIndex === -1) {
          newlineIndex = code.length;
          code += "\n";
        }
        return {
          code: code.slice(0, newlineIndex + 1) + prefix + code.slice(newlineIndex + 1) + suffix,
          // The hashbang line has no tokens, so shifting the tokens to account
          // for prefix can happen normally.
          mappings: this.shiftMappings(result.mappings, prefix.length)
        };
      } else {
        return {
          code: prefix + code + suffix,
          mappings: this.shiftMappings(result.mappings, prefix.length)
        };
      }
    }
    processBalancedCode() {
      let braceDepth = 0;
      let parenDepth = 0;
      while (!this.tokens.isAtEnd()) {
        if (this.tokens.matches1(TokenType3.braceL) || this.tokens.matches1(TokenType3.dollarBraceL)) {
          braceDepth++;
        } else if (this.tokens.matches1(TokenType3.braceR)) {
          if (braceDepth === 0) {
            return;
          }
          braceDepth--;
        }
        if (this.tokens.matches1(TokenType3.parenL)) {
          parenDepth++;
        } else if (this.tokens.matches1(TokenType3.parenR)) {
          if (parenDepth === 0) {
            return;
          }
          parenDepth--;
        }
        this.processToken();
      }
    }
    processToken() {
      if (this.tokens.matches1(TokenType3._class)) {
        this.processClass();
        return;
      }
      for (const transformer of this.transformers) {
        const wasProcessed = transformer.process();
        if (wasProcessed) {
          return;
        }
      }
      this.tokens.copyToken();
    }
    /**
     * Skip past a class with a name and return that name.
     */
    processNamedClass() {
      if (!this.tokens.matches2(TokenType3._class, TokenType3.name)) {
        throw new Error("Expected identifier for exported class name.");
      }
      const name = this.tokens.identifierNameAtIndex(this.tokens.currentIndex() + 1);
      this.processClass();
      return name;
    }
    processClass() {
      const classInfo = getClassInfo(this, this.tokens, this.nameManager, this.disableESTransforms);
      const needsCommaExpression = (classInfo.headerInfo.isExpression || !classInfo.headerInfo.className) && classInfo.staticInitializerNames.length + classInfo.instanceInitializerNames.length > 0;
      let className = classInfo.headerInfo.className;
      if (needsCommaExpression) {
        className = this.nameManager.claimFreeName("_class");
        this.generatedVariables.push(className);
        this.tokens.appendCode(` (${className} =`);
      }
      const classToken = this.tokens.currentToken();
      const contextId = classToken.contextId;
      if (contextId == null) {
        throw new Error("Expected class to have a context ID.");
      }
      this.tokens.copyExpectedToken(TokenType3._class);
      while (!this.tokens.matchesContextIdAndLabel(TokenType3.braceL, contextId)) {
        this.processToken();
      }
      this.processClassBody(classInfo, className);
      const staticInitializerStatements = classInfo.staticInitializerNames.map(
        (name) => `${className}.${name}()`
      );
      if (needsCommaExpression) {
        this.tokens.appendCode(
          `, ${staticInitializerStatements.map((s) => `${s}, `).join("")}${className})`
        );
      } else if (classInfo.staticInitializerNames.length > 0) {
        this.tokens.appendCode(` ${staticInitializerStatements.map((s) => `${s};`).join(" ")}`);
      }
    }
    /**
     * We want to just handle class fields in all contexts, since TypeScript supports them. Later,
     * when some JS implementations support class fields, this should be made optional.
     */
    processClassBody(classInfo, className) {
      const {
        headerInfo,
        constructorInsertPos,
        constructorInitializerStatements,
        fields,
        instanceInitializerNames,
        rangesToRemove
      } = classInfo;
      let fieldIndex = 0;
      let rangeToRemoveIndex = 0;
      const classContextId = this.tokens.currentToken().contextId;
      if (classContextId == null) {
        throw new Error("Expected non-null context ID on class.");
      }
      this.tokens.copyExpectedToken(TokenType3.braceL);
      if (this.isReactHotLoaderTransformEnabled) {
        this.tokens.appendCode(
          "__reactstandin__regenerateByEval(key, code) {this[key] = eval(code);}"
        );
      }
      const needsConstructorInit = constructorInitializerStatements.length + instanceInitializerNames.length > 0;
      if (constructorInsertPos === null && needsConstructorInit) {
        const constructorInitializersCode = this.makeConstructorInitCode(
          constructorInitializerStatements,
          instanceInitializerNames,
          className
        );
        if (headerInfo.hasSuperclass) {
          const argsName = this.nameManager.claimFreeName("args");
          this.tokens.appendCode(
            `constructor(...${argsName}) { super(...${argsName}); ${constructorInitializersCode}; }`
          );
        } else {
          this.tokens.appendCode(`constructor() { ${constructorInitializersCode}; }`);
        }
      }
      while (!this.tokens.matchesContextIdAndLabel(TokenType3.braceR, classContextId)) {
        if (fieldIndex < fields.length && this.tokens.currentIndex() === fields[fieldIndex].start) {
          let needsCloseBrace = false;
          if (this.tokens.matches1(TokenType3.bracketL)) {
            this.tokens.copyTokenWithPrefix(`${fields[fieldIndex].initializerName}() {this`);
          } else if (this.tokens.matches1(TokenType3.string) || this.tokens.matches1(TokenType3.num)) {
            this.tokens.copyTokenWithPrefix(`${fields[fieldIndex].initializerName}() {this[`);
            needsCloseBrace = true;
          } else {
            this.tokens.copyTokenWithPrefix(`${fields[fieldIndex].initializerName}() {this.`);
          }
          while (this.tokens.currentIndex() < fields[fieldIndex].end) {
            if (needsCloseBrace && this.tokens.currentIndex() === fields[fieldIndex].equalsIndex) {
              this.tokens.appendCode("]");
            }
            this.processToken();
          }
          this.tokens.appendCode("}");
          fieldIndex++;
        } else if (rangeToRemoveIndex < rangesToRemove.length && this.tokens.currentIndex() >= rangesToRemove[rangeToRemoveIndex].start) {
          if (this.tokens.currentIndex() < rangesToRemove[rangeToRemoveIndex].end) {
            this.tokens.removeInitialToken();
          }
          while (this.tokens.currentIndex() < rangesToRemove[rangeToRemoveIndex].end) {
            this.tokens.removeToken();
          }
          rangeToRemoveIndex++;
        } else if (this.tokens.currentIndex() === constructorInsertPos) {
          this.tokens.copyToken();
          if (needsConstructorInit) {
            this.tokens.appendCode(
              `;${this.makeConstructorInitCode(
                constructorInitializerStatements,
                instanceInitializerNames,
                className
              )};`
            );
          }
          this.processToken();
        } else {
          this.processToken();
        }
      }
      this.tokens.copyExpectedToken(TokenType3.braceR);
    }
    makeConstructorInitCode(constructorInitializerStatements, instanceInitializerNames, className) {
      return [
        ...constructorInitializerStatements,
        ...instanceInitializerNames.map((name) => `${className}.prototype.${name}.call(this)`)
      ].join(";");
    }
    /**
     * Normally it's ok to simply remove type tokens, but we need to be more careful when dealing with
     * arrow function return types since they can confuse the parser. In that case, we want to move
     * the close-paren to the same line as the arrow.
     *
     * See https://github.com/alangpierce/sucrase/issues/391 for more details.
     */
    processPossibleArrowParamEnd() {
      if (this.tokens.matches2(TokenType3.parenR, TokenType3.colon) && this.tokens.tokenAtRelativeIndex(1).isType) {
        let nextNonTypeIndex = this.tokens.currentIndex() + 1;
        while (this.tokens.tokens[nextNonTypeIndex].isType) {
          nextNonTypeIndex++;
        }
        if (this.tokens.matches1AtIndex(nextNonTypeIndex, TokenType3.arrow)) {
          this.tokens.removeInitialToken();
          while (this.tokens.currentIndex() < nextNonTypeIndex) {
            this.tokens.removeToken();
          }
          this.tokens.replaceTokenTrimmingLeftWhitespace(") =>");
          return true;
        }
      }
      return false;
    }
    /**
     * An async arrow function might be of the form:
     *
     * async <
     *   T
     * >() => {}
     *
     * in which case, removing the type parameters will cause a syntax error. Detect this case and
     * move the open-paren earlier.
     */
    processPossibleAsyncArrowWithTypeParams() {
      if (!this.tokens.matchesContextual(ContextualKeyword._async) && !this.tokens.matches1(TokenType3._async)) {
        return false;
      }
      const nextToken2 = this.tokens.tokenAtRelativeIndex(1);
      if (nextToken2.type !== TokenType3.lessThan || !nextToken2.isType) {
        return false;
      }
      let nextNonTypeIndex = this.tokens.currentIndex() + 1;
      while (this.tokens.tokens[nextNonTypeIndex].isType) {
        nextNonTypeIndex++;
      }
      if (this.tokens.matches1AtIndex(nextNonTypeIndex, TokenType3.parenL)) {
        this.tokens.replaceToken("async (");
        this.tokens.removeInitialToken();
        while (this.tokens.currentIndex() < nextNonTypeIndex) {
          this.tokens.removeToken();
        }
        this.tokens.removeToken();
        this.processBalancedCode();
        this.processToken();
        return true;
      }
      return false;
    }
    processPossibleTypeRange() {
      if (this.tokens.currentToken().isType) {
        this.tokens.removeInitialToken();
        while (this.tokens.currentToken().isType) {
          this.tokens.removeToken();
        }
        return true;
      }
      return false;
    }
    shiftMappings(mappings, prefixLength) {
      for (let i = 0; i < mappings.length; i++) {
        const mapping = mappings[i];
        if (mapping !== void 0) {
          mappings[i] = mapping + prefixLength;
        }
      }
      return mappings;
    }
  };

  // node_modules/sucrase/dist/esm/util/formatTokens.js
  var import_lines_and_columns = __toESM(require_build());

  // node_modules/sucrase/dist/esm/util/getTSImportedNames.js
  function getTSImportedNames(tokens) {
    const importedNames = /* @__PURE__ */ new Set();
    for (let i = 0; i < tokens.tokens.length; i++) {
      if (tokens.matches1AtIndex(i, TokenType3._import) && !tokens.matches3AtIndex(i, TokenType3._import, TokenType3.name, TokenType3.eq)) {
        collectNamesForImport(tokens, i, importedNames);
      }
    }
    return importedNames;
  }
  function collectNamesForImport(tokens, index, importedNames) {
    index++;
    if (tokens.matches1AtIndex(index, TokenType3.parenL)) {
      return;
    }
    if (tokens.matches1AtIndex(index, TokenType3.name)) {
      importedNames.add(tokens.identifierNameAtIndex(index));
      index++;
      if (tokens.matches1AtIndex(index, TokenType3.comma)) {
        index++;
      }
    }
    if (tokens.matches1AtIndex(index, TokenType3.star)) {
      index += 2;
      importedNames.add(tokens.identifierNameAtIndex(index));
      index++;
    }
    if (tokens.matches1AtIndex(index, TokenType3.braceL)) {
      index++;
      collectNamesForNamedImport(tokens, index, importedNames);
    }
  }
  function collectNamesForNamedImport(tokens, index, importedNames) {
    while (true) {
      if (tokens.matches1AtIndex(index, TokenType3.braceR)) {
        return;
      }
      const specifierInfo = getImportExportSpecifierInfo(tokens, index);
      index = specifierInfo.endIndex;
      if (!specifierInfo.isType) {
        importedNames.add(specifierInfo.rightName);
      }
      if (tokens.matches2AtIndex(index, TokenType3.comma, TokenType3.braceR)) {
        return;
      } else if (tokens.matches1AtIndex(index, TokenType3.braceR)) {
        return;
      } else if (tokens.matches1AtIndex(index, TokenType3.comma)) {
        index++;
      } else {
        throw new Error(`Unexpected token: ${JSON.stringify(tokens.tokens[index])}`);
      }
    }
  }

  // node_modules/sucrase/dist/esm/index.js
  function transform(code, options) {
    validateOptions(options);
    try {
      const sucraseContext = getSucraseContext(code, options);
      const transformer = new RootTransformer(
        sucraseContext,
        options.transforms,
        Boolean(options.enableLegacyBabel5ModuleInterop),
        options
      );
      const transformerResult = transformer.transform();
      let result = { code: transformerResult.code };
      if (options.sourceMapOptions) {
        if (!options.filePath) {
          throw new Error("filePath must be specified when generating a source map.");
        }
        result = {
          ...result,
          sourceMap: computeSourceMap(
            transformerResult,
            options.filePath,
            options.sourceMapOptions,
            code,
            sucraseContext.tokenProcessor.tokens
          )
        };
      }
      return result;
    } catch (e) {
      if (options.filePath) {
        e.message = `Error transforming ${options.filePath}: ${e.message}`;
      }
      throw e;
    }
  }
  function getSucraseContext(code, options) {
    const isJSXEnabled2 = options.transforms.includes("jsx");
    const isTypeScriptEnabled2 = options.transforms.includes("typescript");
    const isFlowEnabled2 = options.transforms.includes("flow");
    const disableESTransforms = options.disableESTransforms === true;
    const file = parse4(code, isJSXEnabled2, isTypeScriptEnabled2, isFlowEnabled2);
    const tokens = file.tokens;
    const scopes = file.scopes;
    const nameManager = new NameManager(code, tokens);
    const helperManager = new HelperManager(nameManager);
    const tokenProcessor = new TokenProcessor(
      code,
      tokens,
      isFlowEnabled2,
      disableESTransforms,
      helperManager
    );
    const enableLegacyTypeScriptModuleInterop = Boolean(options.enableLegacyTypeScriptModuleInterop);
    let importProcessor = null;
    if (options.transforms.includes("imports")) {
      importProcessor = new CJSImportProcessor(
        nameManager,
        tokenProcessor,
        enableLegacyTypeScriptModuleInterop,
        options,
        options.transforms.includes("typescript"),
        Boolean(options.keepUnusedImports),
        helperManager
      );
      importProcessor.preprocessTokens();
      identifyShadowedGlobals(tokenProcessor, scopes, importProcessor.getGlobalNames());
      if (options.transforms.includes("typescript") && !options.keepUnusedImports) {
        importProcessor.pruneTypeOnlyImports();
      }
    } else if (options.transforms.includes("typescript") && !options.keepUnusedImports) {
      identifyShadowedGlobals(tokenProcessor, scopes, getTSImportedNames(tokenProcessor));
    }
    return { tokenProcessor, scopes, nameManager, importProcessor, helperManager };
  }

  // src/strip-entry.js
  globalThis.benchStrip = (code) => {
    let result;
    try {
      result = transform(code, {
        transforms: ["typescript", "jsx"],
        jsxRuntime: "classic",
        production: true,
        keepUnusedImports: true,
        disableESTransforms: true,
        filePath: "cell.tsx",
        sourceMapOptions: { compiledFilename: "cell.tsx" }
      });
    } catch {
      result = transform(code, {
        transforms: ["typescript"],
        keepUnusedImports: true,
        disableESTransforms: true,
        filePath: "cell.tsx",
        sourceMapOptions: { compiledFilename: "cell.tsx" }
      });
    }
    parse3(result.code, { ecmaVersion: "latest", sourceType: "module", allowAwaitOutsideFunction: true });
    return result.code;
  };
})();
