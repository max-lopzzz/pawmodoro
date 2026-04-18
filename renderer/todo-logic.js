function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function createTask(name) {
  return { id: generateId(), name: name, checked: false, estimatedMinutes: null, loggedMinutes: 0, children: [], collapsed: false }
}

function setCheckedDeep(node, checked) {
  return Object.assign({}, node, {
    checked: checked,
    children: node.children.map(function (c) { return setCheckedDeep(c, checked) })
  })
}

function checkTask(tasks, id, checked) {
  function processNode(node) {
    if (node.id === id) return setCheckedDeep(node, checked)
    var newChildren = checkTask(node.children, id, checked)
    var allChecked = newChildren.length > 0 && newChildren.every(function (c) { return c.checked })
    var parentChecked = newChildren.length > 0
      ? (checked ? allChecked : allChecked)
      : node.checked
    return Object.assign({}, node, { children: newChildren, checked: parentChecked })
  }
  return tasks.map(processNode)
}

function getLeafCount(node) {
  if (node.children.length === 0) return 1
  return node.children.reduce(function (sum, c) { return sum + getLeafCount(c) }, 0)
}

function getCheckedLeafCount(node) {
  if (node.children.length === 0) return node.checked ? 1 : 0
  return node.children.reduce(function (sum, c) { return sum + getCheckedLeafCount(c) }, 0)
}

function getCompletionPercent(node) {
  var total = getLeafCount(node)
  if (total === 0) return 0
  return Math.round((getCheckedLeafCount(node) / total) * 100)
}

function getOverallPercent(tasks) {
  if (tasks.length === 0) return 0
  var totalLeaves = tasks.reduce(function (sum, t) { return sum + getLeafCount(t) }, 0)
  if (totalLeaves === 0) return 0
  var checkedLeaves = tasks.reduce(function (sum, t) { return sum + getCheckedLeafCount(t) }, 0)
  return Math.round((checkedLeaves / totalLeaves) * 100)
}

function addMinutes(tasks, id, minutes) {
  return tasks.map(function (task) {
    if (task.id === id) return Object.assign({}, task, { loggedMinutes: task.loggedMinutes + minutes })
    return Object.assign({}, task, { children: addMinutes(task.children, id, minutes) })
  })
}

function addTask(tasks, parentId, task) {
  if (parentId === null) return tasks.concat([task])
  return tasks.map(function (t) {
    if (t.id === parentId) return Object.assign({}, t, { children: t.children.concat([task]) })
    return Object.assign({}, t, { children: addTask(t.children, parentId, task) })
  })
}

function deleteTask(tasks, id) {
  return tasks
    .filter(function (t) { return t.id !== id })
    .map(function (t) { return Object.assign({}, t, { children: deleteTask(t.children, id) }) })
}

function findTask(tasks, id) {
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].id === id) return tasks[i]
    var found = findTask(tasks[i].children, id)
    if (found) return found
  }
  return null
}

function parseTimeInput(str) {
  if (!str) return null
  str = str.trim()
  var hourMatch = str.match(/^(\d+(?:\.\d+)?)h$/)
  if (hourMatch) { var mins = Math.round(parseFloat(hourMatch[1]) * 60); return mins > 0 ? mins : null }
  var minMatch = str.match(/^(\d+)m$/)
  if (minMatch) { var m = parseInt(minMatch[1], 10); return m > 0 ? m : null }
  var numMatch = str.match(/^(\d+)$/)
  if (numMatch) { var n = parseInt(numMatch[1], 10); return n > 0 ? n : null }
  return null
}

function formatLoggedTime(minutes) {
  var h = Math.floor(minutes / 60)
  var m = minutes % 60
  return h + ':' + (m < 10 ? '0' : '') + m
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createTask, checkTask, getLeafCount, getCheckedLeafCount, getCompletionPercent, getOverallPercent, addMinutes, addTask, deleteTask, findTask, parseTimeInput, formatLoggedTime }
}
