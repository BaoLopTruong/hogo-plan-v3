(function () {
  var KEY = document.body && document.body.getAttribute("data-store");
  if (!KEY || !document.getElementById("btn-save")) return;
  var FILE = document.body.getAttribute("data-file");
  var BOARD = KEY === "hogo3-module-status" ? "module-status" : "plan";
  var BASE = "https://hogo-plan-v3-board-default-rtdb.asia-southeast1.firebasedatabase.app/boards/" + BOARD + "/rows";
  function fkey(id) {
    return String(id).replace(/[.#$[\]/]/g, function (c) { return "_" + c.charCodeAt(0) + "_"; });
  }
  function rowUrl(id) {
    return BASE + "/" + encodeURIComponent(fkey(id)) + ".json";
  }
  var OPTS = JSON.parse(document.getElementById("st-opts").textContent);
  var LBL = {};
  OPTS.forEach(function (o) { LBL[o.v] = o.l; });

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}"); }
    catch (e) { return {}; }
  }
  function saveLocal(o) {
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {}
  }

  var store = load();
  var rows = [].slice.call(document.querySelectorAll("tr[data-id]"));
  var rowById = {};
  var timer = {};
  var inflight = {};
  var again = {};
  var syncState = "sync";
  var syncAt = 0;

  function fmt(t) {
    if (!t) return "";
    var d = new Date(+t);
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return p(d.getDate()) + "/" + p(d.getMonth() + 1) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function grow(t) {
    t.style.height = "auto";
    t.style.height = (t.scrollHeight + 2) + "px";
  }
  function paint(r) {
    var s = r.querySelector("select.st");
    if (!s) return;
    s.className = "st " + s.value;
    r.setAttribute("data-s", s.value);
    var u = r.querySelector(".upd");
    if (u) u.textContent = r.getAttribute("data-t") ? ("sửa " + fmt(r.getAttribute("data-t"))) : "";
    if (window.hogoApply) window.hogoApply();
  }
  function stamp() {
    var el = document.getElementById("stamp");
    if (!el) return;
    var html = "Đang đồng bộ…";
    if (syncState === "save") html = '<span class="dirty">Đang lưu…</span>';
    else if (syncState === "err") html = '<span class="dirty">Chưa lưu được, sẽ thử lại</span>';
    else if (syncState === "ok") html = '<span class="ok">Đã lưu lúc ' + fmt(syncAt || Date.now()) + "</span> · ai mở link này cũng thấy";
    el.innerHTML = html;
    if (window.hogoApply) window.hogoApply();
  }
  function noteToSave(n) {
    var value = n.value;
    var prev = n.getAttribute("data-vi-note");
    if (prev == null) prev = "";
    if (document.documentElement.lang === "en" && window.hogoT && window.hogoT(prev) === value) return prev;
    return value;
  }
  function focused(r) {
    var el = document.activeElement;
    return !!(el && r.contains(el) && (el.tagName === "TEXTAREA" || el.tagName === "SELECT"));
  }
  function applyRow(r, st) {
    var s = r.querySelector("select.st");
    var n = r.querySelector("textarea.nt");
    if (!s || !n || !st || !LBL[st.s] || focused(r)) return false;
    s.value = st.s;
    n.value = st.n == null ? "" : String(st.n);
    n.setAttribute("data-vi-note", n.value);
    r.setAttribute("data-t", st.t);
    r.classList.add("chg");
    paint(r);
    grow(n);
    return true;
  }

  function pushRow(id) {
    var st = store[id];
    if (!st) return;
    if (inflight[id]) { again[id] = true; return; }
    inflight[id] = true;
    syncState = "save";
    stamp();
    var url = rowUrl(id);
    fetch(url, { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (remote) {
        st = store[id];
        if (!st) return;
        if (remote && remote.t > st.t) {
          store[id] = { s: remote.s, n: remote.n, t: remote.t };
          saveLocal(store);
          if (applyRow(rowById[id], store[id]) && window.onStatusChange) window.onStatusChange();
          return;
        }
        return fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ s: String(st.s), n: st.n == null ? "" : String(st.n), t: st.t }),
          keepalive: true
        }).then(function (res) {
          if (!res.ok) throw new Error("save");
          syncAt = st.t;
        });
      })
      .then(function () {
        inflight[id] = false;
        if (again[id]) { again[id] = false; pushRow(id); return; }
        if (!Object.keys(inflight).some(function (k) { return inflight[k]; }) && !Object.keys(timer).length) {
          syncState = "ok";
          stamp();
        }
      })
      .catch(function () {
        inflight[id] = false;
        syncState = "err";
        stamp();
        clearTimeout(timer[id]);
        timer[id] = setTimeout(function () { delete timer[id]; pushRow(id); }, 5000);
      });
  }
  function schedule(id, delay) {
    clearTimeout(timer[id]);
    timer[id] = setTimeout(function () { delete timer[id]; pushRow(id); }, delay == null ? 700 : delay);
  }

  function remoteById(remote) {
    var keyToId = {};
    rows.forEach(function (r) { keyToId[fkey(r.getAttribute("data-id"))] = r.getAttribute("data-id"); });
    var out = {};
    Object.keys(remote || {}).forEach(function (k) {
      if (keyToId[k]) out[keyToId[k]] = remote[k];
    });
    return out;
  }
  function adopt(remote) {
    remote = remoteById(remote);
    var changed = false;
    rows.forEach(function (r) {
      var id = r.getAttribute("data-id");
      var st = remote[id];
      if (!st || !LBL[st.s]) return;
      var local = store[id];
      if (local && local.t >= st.t) return;
      if (focused(r)) return;
      store[id] = { s: st.s, n: st.n == null ? "" : String(st.n), t: st.t };
      if (applyRow(r, store[id])) changed = true;
    });
    saveLocal(store);
    if (changed && window.onStatusChange) window.onStatusChange();
    Object.keys(store).forEach(function (id) {
      if (!rowById[id]) return;
      var remoteRow = remote[id];
      if (!remoteRow || store[id].t > remoteRow.t) schedule(id, 0);
    });
  }

  function pull() {
    if (document.hidden && syncState !== "sync") return Promise.resolve();
    return fetch(BASE + ".json", { cache: "no-store" })
      .then(function (res) { if (!res.ok) throw new Error("load"); return res.json(); })
      .then(function (remote) {
        adopt(remote);
        if (syncState !== "save" && syncState !== "err") {
          syncState = "ok";
          if (!syncAt) syncAt = Date.now();
          stamp();
        }
      })
      .catch(function () {
        if (syncState !== "save") { syncState = "err"; stamp(); }
      });
  }

  rows.forEach(function (r) {
    var id = r.getAttribute("data-id");
    var s = r.querySelector("select.st");
    var n = r.querySelector("textarea.nt");
    if (!s || !n) return;
    rowById[id] = r;
    n.setAttribute("data-vi-note", n.value);
    var bt = +(r.getAttribute("data-t") || 0);
    var st = store[id];
    if (st && LBL[st.s] && st.t > bt) applyRow(r, st);
    else paint(r);
    function commit() {
      var note = noteToSave(n);
      n.setAttribute("data-vi-note", note);
      store[id] = { s: s.value, n: note, t: Date.now() };
      saveLocal(store);
      r.setAttribute("data-t", store[id].t);
      r.classList.add("chg");
      paint(r);
      schedule(id, 0);
      if (window.onStatusChange) window.onStatusChange();
    }
    s.addEventListener("change", commit);
    n.addEventListener("input", function () { grow(n); });
    n.addEventListener("change", commit);
    var pendingInput;
    n.addEventListener("input", function () {
      clearTimeout(pendingInput);
      pendingInput = setTimeout(commit, 700);
    });
  });

  window.addEventListener("load", function () {
    document.querySelectorAll("textarea.nt").forEach(grow);
  });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) pull();
  });
  setInterval(function () { if (!document.hidden) pull(); }, 12000);
  pull();

  function today() {
    var d = new Date();
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "_" + p(d.getHours()) + p(d.getMinutes());
  }
  function dl(name, blob) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  document.getElementById("btn-save").onclick = function () {
    document.querySelectorAll("select.st").forEach(function (s) {
      [].forEach.call(s.options, function (o) {
        if (o.value === s.value) o.setAttribute("selected", "");
        else o.removeAttribute("selected");
      });
    });
    document.querySelectorAll("textarea.nt").forEach(function (t) {
      t.textContent = t.getAttribute("data-vi-note") || t.value;
      t.removeAttribute("style");
    });
    var hidden = [];
    document.querySelectorAll("tbody tr").forEach(function (r) {
      if (r.style.display) { hidden.push([r, r.style.display]); r.style.display = ""; }
    });
    document.querySelectorAll("tr.chg").forEach(function (r) { r.classList.remove("chg"); });
    var html = "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
    hidden.forEach(function (h) { h[0].style.display = h[1]; });
    document.querySelectorAll("textarea.nt").forEach(grow);
    dl(FILE + "_" + today() + ".html", new Blob([html], { type: "text/html;charset=utf-8" }));
  };
  document.getElementById("btn-csv").onclick = function () {
    var out = [];
    document.querySelectorAll("table").forEach(function (t) {
      if (!t.querySelector("tr[data-id]")) return;
      var cap = t.getAttribute("data-cap") || "";
      var hd = [].map.call(t.querySelectorAll("thead th"), function (th) { return th.textContent.trim(); });
      out.push(["Bảng"].concat(hd));
      t.querySelectorAll("tbody tr[data-id]").forEach(function (r) {
        out.push([cap].concat([].map.call(r.children, function (td) {
          var s = td.querySelector("select.st");
          if (s) return LBL[s.value];
          var n = td.querySelector("textarea.nt");
          if (n) return n.getAttribute("data-vi-note") || n.value;
          var c = td.cloneNode(true);
          c.querySelectorAll(".upd").forEach(function (x) { x.remove(); });
          return c.textContent.replace(/\s+/g, " ").trim();
        })));
      });
      out.push([]);
    });
    var csv = out.map(function (r) {
      return r.map(function (v) {
        v = v == null ? "" : String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(",");
    }).join("\r\n");
    dl(FILE + "_" + today() + ".csv", new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  };
  document.getElementById("btn-reset").onclick = function () {
    if (!confirm(window.hogoT("Tải lại bản đang chia sẻ? Sửa chưa kịp lưu trên máy này sẽ mất."))) return;
    try { localStorage.removeItem(KEY); } catch (e) {}
    location.reload();
  };
  stamp();
  if (window.onStatusChange) window.onStatusChange();
})();
