var panelOpen = false

var elTodoPanel     = document.getElementById('todo-panel')
var elTodoList      = document.getElementById('todo-list')
var elTodoOverall   = document.getElementById('todo-overall')
var elBtnTodoToggle = document.getElementById('btn-todo-toggle')
var elBtnAddRoot    = document.getElementById('btn-todo-add-root')

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function formatEstimate(minutes) {
  if (!minutes) return '\u2014'
  if (minutes % 60 === 0) return (minutes / 60) + 'h'
  var h = Math.floor(minutes / 60)
  var m = minutes % 60
  return h > 0 ? h + 'h ' + m + 'm' : m + 'm'
}

function updateTaskName(tasks, id, name) {
  return tasks.map(function (t) {
    if (t.id === id) return Object.assign({}, t, { name: name })
    return Object.assign({}, t, { children: updateTaskName(t.children, id, name) })
  })
}

function setCollapsed(tasks, id, collapsed) {
  return tasks.map(function (t) {
    if (t.id === id) return Object.assign({}, t, { collapsed: collapsed })
    return Object.assign({}, t, { children: setCollapsed(t.children, id, collapsed) })
  })
}

function startInlineNameEdit(nameEl, taskId, isNew) {
  var input = document.createElement('input')
  input.type = 'text'
  input.className = 'task-name-input'
  input.value = isNew ? '' : nameEl.textContent
  nameEl.replaceWith(input)
  input.focus()

  var saved = false
  function save() {
    if (saved) return; saved = true
    var val = input.value.trim()
    if (!val) {
      if (isNew) { var t = loadTasks(); saveTasks(deleteTask(t, taskId)) }
      renderTodoPanel(); return
    }
    saveTasks(updateTaskName(loadTasks(), taskId, val))
    renderTodoPanel()
  }

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    if (e.key === 'Escape') {
      saved = true
      if (isNew) saveTasks(deleteTask(loadTasks(), taskId))
      renderTodoPanel()
    }
  })
  input.addEventListener('blur', save)
}

function startInlineEstEdit(estSpan, taskId) {
  var input = document.createElement('input')
  input.type = 'text'
  input.className = 'task-est-input'
  input.placeholder = '2h / 90m'
  estSpan.replaceWith(input)
  input.focus()

  var saved = false
  function save() {
    if (saved) return; saved = true
    var minutes = input.value.trim() ? parseTimeInput(input.value.trim()) : null
    var tasks = loadTasks().map(function fix(t) {
      if (t.id === taskId) return Object.assign({}, t, { estimatedMinutes: minutes })
      return Object.assign({}, t, { children: t.children.map(fix) })
    })
    saveTasks(tasks)
    renderTodoPanel()
  }

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); save() }
    if (e.key === 'Escape') { saved = true; renderTodoPanel() }
  })
  input.addEventListener('blur', save)
}

function buildTaskEl(task, depth) {
  var row = document.createElement('div')
  row.className = 'task-row'
  row.dataset.taskId = task.id

  var main = document.createElement('div')
  main.className = 'task-row-main' + (state.activeTaskId === task.id ? ' active-task' : '')

  if (depth > 0) {
    var indent = document.createElement('div')
    indent.className = 'task-indent'
    indent.style.width = (depth * 14) + 'px'
    main.appendChild(indent)
  }

  if (task.children.length > 0) {
    var colBtn = document.createElement('button')
    colBtn.className = 'task-collapse-btn'
    colBtn.textContent = task.collapsed ? '\u25B6' : '\u25BC'
    colBtn.addEventListener('click', function () {
      saveTasks(setCollapsed(loadTasks(), task.id, !task.collapsed))
      renderTodoPanel()
    })
    main.appendChild(colBtn)
  } else {
    var spacer = document.createElement('div')
    spacer.className = 'task-collapse-spacer'
    main.appendChild(spacer)
  }

  var checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = 'task-checkbox'
  checkbox.checked = task.checked
  checkbox.addEventListener('change', function () {
    saveTasks(checkTask(loadTasks(), task.id, checkbox.checked))
    renderTodoPanel()
  })
  main.appendChild(checkbox)

  var nameEl = document.createElement('span')
  nameEl.className = 'task-name' + (task.checked ? ' checked' : '')
  nameEl.textContent = task.name || '(unnamed)'
  nameEl.addEventListener('click', function () { startInlineNameEdit(nameEl, task.id, false) })
  main.appendChild(nameEl)

  var addChildBtn = document.createElement('button')
  addChildBtn.className = 'task-add-child-btn'
  addChildBtn.textContent = '+'
  addChildBtn.title = 'Add subtask'
  addChildBtn.addEventListener('click', function () {
    var newTask = createTask('')
    var tasks = addTask(loadTasks(), task.id, newTask)
    if (task.collapsed) tasks = setCollapsed(tasks, task.id, false)
    saveTasks(tasks)
    renderTodoPanel()
    var newEl = elTodoList.querySelector('[data-task-id="' + newTask.id + '"] .task-name')
    if (newEl) startInlineNameEdit(newEl, newTask.id, true)
  })
  main.appendChild(addChildBtn)

  var selectBtn = document.createElement('button')
  selectBtn.className = 'task-select-btn' + (state.activeTaskId === task.id ? ' selected' : '')
  selectBtn.textContent = state.activeTaskId === task.id ? 'Active' : 'Select'
  selectBtn.addEventListener('click', function () {
    state.activeTaskId = state.activeTaskId === task.id ? null : task.id
    render(); renderTodoPanel()
  })
  main.appendChild(selectBtn)

  var delBtn = document.createElement('button')
  delBtn.className = 'task-delete-btn'
  delBtn.textContent = '\u00D7'
  delBtn.addEventListener('click', function () {
    if (state.activeTaskId === task.id) { state.activeTaskId = null; render() }
    saveTasks(deleteTask(loadTasks(), task.id))
    renderTodoPanel()
  })
  main.appendChild(delBtn)
  row.appendChild(main)

  var pct = getCompletionPercent(task)
  var meta = document.createElement('div')
  meta.className = 'task-meta'
  meta.style.paddingLeft = (depth * 14 + 36) + 'px'

  var bar = document.createElement('div')
  bar.className = 'task-progress-bar'
  var fill = document.createElement('div')
  fill.className = 'task-progress-fill'
  fill.style.width = pct + '%'
  bar.appendChild(fill)
  meta.appendChild(bar)

  var timeLine = document.createElement('div')
  timeLine.className = 'task-time-line'

  var estSpan = document.createElement('span')
  estSpan.className = 'task-est-span'
  estSpan.textContent = 'est: ' + formatEstimate(task.estimatedMinutes)
  estSpan.addEventListener('click', function () { startInlineEstEdit(estSpan, task.id) })
  timeLine.appendChild(estSpan)

  var spentSpan = document.createElement('span')
  spentSpan.textContent = 'spent: ' + formatLoggedTime(task.loggedMinutes)
  timeLine.appendChild(spentSpan)

  meta.appendChild(timeLine)
  row.appendChild(meta)

  if (task.children.length > 0 && !task.collapsed) {
    var childrenEl = document.createElement('div')
    childrenEl.className = 'task-children'
    task.children.forEach(function (child) { childrenEl.appendChild(buildTaskEl(child, depth + 1)) })
    row.appendChild(childrenEl)
  }

  return row
}

function renderTodoPanel() {
  var tasks = loadTasks()
  elTodoOverall.textContent = getOverallPercent(tasks) + '%'
  elTodoList.innerHTML = ''
  tasks.forEach(function (task) { elTodoList.appendChild(buildTaskEl(task, 0)) })
}

function openTodoPanel() {
  panelOpen = true
  elTodoPanel.classList.add('open')
  window.windowControls.resize(740)
  renderTodoPanel()
}

function closeTodoPanel() {
  panelOpen = false
  elTodoPanel.classList.remove('open')
  window.windowControls.resize(420)
}

elBtnTodoToggle.addEventListener('click', function () {
  if (panelOpen) closeTodoPanel()
  else openTodoPanel()
})

elBtnAddRoot.addEventListener('click', function () {
  var newTask = createTask('')
  saveTasks(addTask(loadTasks(), null, newTask))
  renderTodoPanel()
  var newEl = elTodoList.querySelector('[data-task-id="' + newTask.id + '"] .task-name')
  if (newEl) startInlineNameEdit(newEl, newTask.id, true)
})

renderTodoPanel()
