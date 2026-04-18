var {
  createTask,
  checkTask,
  getLeafCount,
  getCheckedLeafCount,
  getCompletionPercent,
  getOverallPercent,
  addMinutes,
  addTask,
  deleteTask,
  findTask,
  parseTimeInput,
  formatLoggedTime
} = require('../renderer/todo-logic.js')

test('createTask returns correct shape', function () {
  var t = createTask('Write tests')
  expect(t.name).toBe('Write tests')
  expect(t.checked).toBe(false)
  expect(t.estimatedMinutes).toBeNull()
  expect(t.loggedMinutes).toBe(0)
  expect(t.children).toEqual([])
  expect(t.collapsed).toBe(false)
  expect(typeof t.id).toBe('string')
  expect(t.id.length).toBeGreaterThan(0)
})

test('checkTask sets node checked', function () {
  var tasks = [createTask('A')]
  var result = checkTask(tasks, tasks[0].id, true)
  expect(result[0].checked).toBe(true)
})

test('checkTask propagates to all descendants', function () {
  var child1 = createTask('Child 1')
  var child2 = createTask('Child 2')
  var grandchild = createTask('Grandchild')
  child2.children = [grandchild]
  var parent = createTask('Parent')
  parent.children = [child1, child2]
  var result = checkTask([parent], parent.id, true)
  var p = result[0]
  expect(p.checked).toBe(true)
  expect(p.children[0].checked).toBe(true)
  expect(p.children[1].checked).toBe(true)
  expect(p.children[1].children[0].checked).toBe(true)
})

test('checkTask auto-checks parent when all siblings checked', function () {
  var child1 = createTask('C1'); child1.checked = true
  var child2 = createTask('C2')
  var parent = createTask('Parent')
  parent.children = [child1, child2]
  var result = checkTask([parent], child2.id, true)
  expect(result[0].checked).toBe(true)
})

test('checkTask auto-unchecks parent when sibling unchecked', function () {
  var child1 = createTask('C1'); child1.checked = true
  var child2 = createTask('C2'); child2.checked = true
  var parent = createTask('Parent'); parent.checked = true
  parent.children = [child1, child2]
  var result = checkTask([parent], child1.id, false)
  expect(result[0].checked).toBe(false)
})

test('getLeafCount returns 1 for leaf node', function () {
  expect(getLeafCount(createTask('A'))).toBe(1)
})

test('getLeafCount returns total leaves in subtree', function () {
  var child1 = createTask('C1')
  var child2 = createTask('C2')
  var grandchild = createTask('GC')
  child2.children = [grandchild]
  var parent = createTask('P')
  parent.children = [child1, child2]
  expect(getLeafCount(parent)).toBe(2)
})

test('getCheckedLeafCount counts checked leaves only', function () {
  var c1 = createTask('C1'); c1.checked = true
  var c2 = createTask('C2')
  var gc = createTask('GC'); gc.checked = true
  c2.children = [gc]
  var p = createTask('P')
  p.children = [c1, c2]
  expect(getCheckedLeafCount(p)).toBe(2)
})

test('getCompletionPercent for leaf: 0% unchecked', function () {
  expect(getCompletionPercent(createTask('A'))).toBe(0)
})

test('getCompletionPercent for leaf: 100% checked', function () {
  var t = createTask('A'); t.checked = true
  expect(getCompletionPercent(t)).toBe(100)
})

test('getCompletionPercent partial tree', function () {
  var c1 = createTask('C1'); c1.checked = true
  var c2 = createTask('C2')
  var p = createTask('P')
  p.children = [c1, c2]
  expect(getCompletionPercent(p)).toBe(50)
})

test('getOverallPercent returns 0 for empty list', function () {
  expect(getOverallPercent([])).toBe(0)
})

test('getOverallPercent across multiple root tasks', function () {
  var a = createTask('A'); a.checked = true
  var b = createTask('B')
  var c = createTask('C'); c.checked = true
  expect(getOverallPercent([a, b, c])).toBe(67)
})

test('addMinutes increments loggedMinutes', function () {
  var tasks = [createTask('A')]
  var id = tasks[0].id
  var result = addMinutes(tasks, id, 25)
  expect(result[0].loggedMinutes).toBe(25)
})

test('addMinutes accumulates multiple calls', function () {
  var tasks = [createTask('A')]
  var id = tasks[0].id
  tasks = addMinutes(tasks, id, 25)
  tasks = addMinutes(tasks, id, 10)
  expect(tasks[0].loggedMinutes).toBe(35)
})

test('addMinutes no-ops on missing id', function () {
  var tasks = [createTask('A')]
  var result = addMinutes(tasks, 'nonexistent-id', 25)
  expect(result[0].loggedMinutes).toBe(0)
})

test('addMinutes works on nested task', function () {
  var child = createTask('Child')
  var parent = createTask('Parent')
  parent.children = [child]
  var result = addMinutes([parent], child.id, 30)
  expect(result[0].children[0].loggedMinutes).toBe(30)
})

test('addTask at root when parentId is null', function () {
  var tasks = [createTask('A')]
  var newTask = createTask('B')
  var result = addTask(tasks, null, newTask)
  expect(result.length).toBe(2)
  expect(result[1].name).toBe('B')
})

test('addTask as child of existing task', function () {
  var parent = createTask('Parent')
  var child = createTask('Child')
  var result = addTask([parent], parent.id, child)
  expect(result[0].children.length).toBe(1)
  expect(result[0].children[0].name).toBe('Child')
})

test('deleteTask removes root task', function () {
  var a = createTask('A')
  var b = createTask('B')
  var result = deleteTask([a, b], a.id)
  expect(result.length).toBe(1)
  expect(result[0].name).toBe('B')
})

test('deleteTask removes nested task and its descendants', function () {
  var child = createTask('Child')
  var grandchild = createTask('GC')
  child.children = [grandchild]
  var parent = createTask('Parent')
  parent.children = [child]
  var result = deleteTask([parent], child.id)
  expect(result[0].children.length).toBe(0)
})

test('findTask returns correct node', function () {
  var a = createTask('A')
  var b = createTask('B')
  var result = findTask([a, b], b.id)
  expect(result).not.toBeNull()
  expect(result.name).toBe('B')
})

test('findTask returns null when not found', function () {
  expect(findTask([createTask('A')], 'nonexistent')).toBeNull()
})

test('findTask finds nested task', function () {
  var child = createTask('Child')
  var parent = createTask('Parent')
  parent.children = [child]
  var result = findTask([parent], child.id)
  expect(result.name).toBe('Child')
})

test('parseTimeInput: "2h" → 120', function () { expect(parseTimeInput('2h')).toBe(120) })
test('parseTimeInput: "90m" → 90', function () { expect(parseTimeInput('90m')).toBe(90) })
test('parseTimeInput: "1.5h" → 90', function () { expect(parseTimeInput('1.5h')).toBe(90) })
test('parseTimeInput: "45" → 45', function () { expect(parseTimeInput('45')).toBe(45) })
test('parseTimeInput: invalid → null', function () {
  expect(parseTimeInput('abc')).toBeNull()
  expect(parseTimeInput('')).toBeNull()
  expect(parseTimeInput('0m')).toBeNull()
})

test('formatLoggedTime: 0 → "0:00"', function () { expect(formatLoggedTime(0)).toBe('0:00') })
test('formatLoggedTime: 90 → "1:30"', function () { expect(formatLoggedTime(90)).toBe('1:30') })
test('formatLoggedTime: 150 → "2:30"', function () { expect(formatLoggedTime(150)).toBe('2:30') })
test('formatLoggedTime: 5 → "0:05"', function () { expect(formatLoggedTime(5)).toBe('0:05') })
