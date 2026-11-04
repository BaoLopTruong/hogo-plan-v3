(function () {
  var DICT = window.HOGO_EN || {};
  var KEY = "hogo-lang";
  var originals = new WeakMap();
  var areaSrc = new WeakMap();
  var applying = false;

  function current() {
    return localStorage.getItem(KEY) === "en" ? "en" : "vi";
  }

  function translateCore(key) {
    if (DICT[key]) return DICT[key];
    if (key.indexOf("sửa ") === 0) return "edited " + key.slice(4);
    if (key.indexOf("File lưu lần cuối: ") === 0) return "Last export: " + key.slice("File lưu lần cuối: ".length);
    var days = { T2: "Mon", T3: "Tue", T4: "Wed", T5: "Thu", T6: "Fri" };
    if (/T[2-6]/.test(key) && !/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(key)) {
      return key.replace(/\bT([2-6])\b/g, function (_, n) { return days["T" + n]; });
    }
    return null;
  }

  window.hogoT = function (s) {
    if (s == null) return s;
    var key = String(s).replace(/\s+/g, " ").trim();
    if (current() !== "en") return s;
    var hit = translateCore(key);
    return hit == null ? s : hit;
  };

  function pClosest(node, sel) {
    var p = node.parentNode;
    return p && p.closest && p.closest(sel);
  }

  function sameSource(stored, current) {
    if (stored == null) return false;
    if (current === stored) return true;
    var hit = translateCore(stored.replace(/\s+/g, " ").trim());
    return hit != null && current.replace(/\s+/g, " ").trim() === hit.replace(/\s+/g, " ").trim();
  }

  function skip(node) {
    var p = node.parentNode;
    if (!p || !p.tagName) return true;
    var tag = p.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA") return true;
    return !!(p.closest && p.closest("[data-no-i18n]"));
  }

  function apply() {
    if (applying) return;
    applying = true;
    var en = current() === "en";
    document.documentElement.lang = en ? "en" : "vi";
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      if (skip(node)) continue;
      var cur = node.nodeValue;
      var dynamic = pClosest(node, ".upd, #stamp, #w8prog");
      if (!originals.has(node)) originals.set(node, cur);
      var src = originals.get(node);
      if (dynamic && !sameSource(src, cur)) {
        originals.set(node, cur);
        src = cur;
      }
      var lead = (src.match(/^\s*/) || [""])[0];
      var trail = (src.match(/\s*$/) || [""])[0];
      var key = src.replace(/\s+/g, " ").trim();
      var hit = key ? translateCore(key) : null;
      if (hit == null) {
        if (cur !== src) originals.set(node, cur);
        continue;
      }
      node.nodeValue = en ? lead + hit + trail : src;
    }
    document.querySelectorAll("textarea.nt").forEach(function (el) {
      if (!areaSrc.has(el)) areaSrc.set(el, el.value);
      var src = areaSrc.get(el);
      var hit = translateCore(src.replace(/\s+/g, " ").trim());
      if (hit == null) return;
      var cur = el.value;
      if (cur !== src && cur.replace(/\s+/g, " ").trim() !== hit.replace(/\s+/g, " ").trim()) return;
      el.value = en ? hit : src;
    });
    document.querySelectorAll("[title], [placeholder]").forEach(function (el) {
      if (el.closest && el.closest("[data-no-i18n]")) return;
      ["title", "placeholder"].forEach(function (attr) {
        if (!el.hasAttribute(attr)) return;
        var storeAttr = "data-vi-" + attr;
        if (!el.hasAttribute(storeAttr)) el.setAttribute(storeAttr, el.getAttribute(attr));
        var src = el.getAttribute(storeAttr);
        if (!en) {
          el.setAttribute(attr, src);
          return;
        }
        var hit = translateCore(src.replace(/\s+/g, " ").trim());
        el.setAttribute(attr, hit == null ? src : hit);
      });
    });
    var root = document.documentElement;
    if (!root.dataset.viTitle) root.dataset.viTitle = document.title;
    var titleSrc = root.dataset.viTitle;
    if (!en) document.title = titleSrc;
    else {
      var titleHit = translateCore(titleSrc.replace(/\s+/g, " ").trim());
      document.title = titleHit == null ? titleSrc : titleHit;
    }
    document.querySelectorAll(".lang-switch button").forEach(function (btn) {
      var on = btn.getAttribute("data-set-lang") === (en ? "en" : "vi");
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
    var back = document.querySelector(".site-nav .back");
    if (back) back.textContent = en ? "← Home" : "← Trang chính";
    var group = document.querySelector(".lang-switch");
    if (group) group.setAttribute("aria-label", en ? "Language" : "Ngôn ngữ");
    applying = false;
  }

  window.hogoApply = apply;

  function isHome() {
    var path = location.pathname || "";
    return /\/$/.test(path) || /\/index\.html$/i.test(path);
  }

  function mount() {
    if (document.querySelector(".site-nav")) return;
    var bar = document.createElement("header");
    bar.className = "site-nav";
    bar.setAttribute("data-no-i18n", "");
    var back = isHome() ? "" : '<a class="back" href="index.html"></a>';
    bar.innerHTML = '<div class="site-nav-inner">' + back +
      '<a class="brand" href="index.html">HoGo v3</a>' +
      '<div class="lang-switch" role="group"></div></div>';
    document.body.insertBefore(bar, document.body.firstChild);
    var group = bar.querySelector(".lang-switch");
    [["vi", "VI"], ["en", "EN"]].forEach(function (pair) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.setAttribute("data-set-lang", pair[0]);
      btn.textContent = pair[1];
      btn.addEventListener("click", function () {
        localStorage.setItem(KEY, pair[0]);
        apply();
      });
      group.appendChild(btn);
    });
    apply();
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
