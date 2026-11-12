// Paper savings calculator on the homepage. Plain arithmetic on the user's own numbers.
// A sheet is about 0.1 mm thick, so a 500-sheet ream is about 5 cm.
;(function () {
  var ids = ['docs', 'weeks', 'saved', 'duplex']
  var el = {}
  ids.forEach(function (id) {
    el[id] = document.getElementById(id)
  })
  if (!el.docs) return

  function num(input) {
    var n = parseFloat(input.value)
    return isFinite(n) && n > 0 ? n : 0
  }

  function update() {
    var pages = num(el.docs) * num(el.weeks) * num(el.saved)
    // Printing both sides puts two pages on each sheet.
    var sheets = el.duplex.checked ? pages / 2 : pages
    var cm = (sheets / 500) * 5
    document.getElementById('out-sheets').textContent = Math.round(sheets).toLocaleString()
    document.getElementById('out-reams').textContent = (sheets / 500).toFixed(1)
    document.getElementById('out-stack').textContent = cm.toFixed(1) + ' cm'
  }

  ids.forEach(function (id) {
    el[id].addEventListener('input', update)
    el[id].addEventListener('change', update)
  })
  update()
})()
