const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectDir = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(projectDir, 'index.html'), 'utf8');
const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/i)?.[1];
assert.ok(script, 'index.html should contain the application script');

test('declares a local favicon that exists in the project', () => {
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="favicon\.svg">/);
  assert.ok(fs.existsSync(path.join(projectDir, 'favicon.svg')));
});

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
  toggle(value, force) {
    const shouldAdd = force === undefined ? !this.values.has(value) : force;
    if (shouldAdd) this.values.add(value);
    else this.values.delete(value);
    return shouldAdd;
  }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.hidden = false;
    this.style = {};
    this.classList = new FakeClassList();
    this.listeners = {};
    this.dataset = {};
    this.parentElement = { querySelector: () => ({ style: {} }) };
  }
  addEventListener(type, callback) {
    (this.listeners[type] ||= []).push(callback);
  }
  focus() {}
  click() { this.clicked = true; }
  reset() {
    for (const id of ['topicId', 'topicTitle', 'topicCopy', 'topicScript', 'metricViews', 'metricLikes', 'metricComments', 'metricSaves']) {
      getElement(id).value = '';
    }
    getElement('topicPlatform').value = 'X';
    getElement('topicStatus').value = '未开始';
  }
}

const elements = new Map();
const getElement = id => {
  if (!elements.has(id)) elements.set(id, new FakeElement(id));
  return elements.get(id);
};

function createApp(initialStorage = null) {
  elements.clear();
  let storedValue = initialStorage;
  const navButtons = ['all', 'todo', 'done', 'hot'].map(nav => {
    const element = new FakeElement(`nav-${nav}`);
    element.dataset.nav = nav;
    return element;
  });
  const ideaButtons = ['新手如何开始做个人 IP', '最近流行的效率工具', '普通人的副业尝试'].map(idea => {
    const element = new FakeElement('idea');
    element.dataset.idea = idea;
    return element;
  });
  const document = {
    getElementById: getElement,
    querySelectorAll(selector) {
      if (selector === '[data-nav]') return navButtons;
      if (selector === '[data-idea]') return ideaButtons;
      return [];
    },
    addEventListener() {},
    createElement: tag => new FakeElement(tag)
  };
  const localStorage = {
    getItem: () => storedValue,
    setItem: (_key, value) => { storedValue = value; }
  };
  getElement('topicRows').parentElement = { querySelector: () => ({ style: {} }) };
  const context = {
    document,
    localStorage,
    crypto: { randomUUID: () => 'test-generated-id' },
    window: { open() {} },
    confirm: () => true,
    setTimeout: callback => { callback(); return 1; },
    clearTimeout() {},
    Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    Intl,
    Date,
    Number,
    JSON,
    Math,
    String,
    console
  };
  vm.runInNewContext(script, context, { filename: 'index.html:inline-script' });
  const trigger = (id, type, event = {}) => getElement(id).listeners[type][0](event);
  const topics = () => {
    try { return JSON.parse(storedValue || '[]'); }
    catch { return []; }
  };
  return { trigger, topics, elements, navButtons };
}

test('creates a topic, stores all fields, and escapes user content in the list', () => {
  const app = createApp();
  app.trigger('addBtn', 'click');
  app.elements.get('topicTitle').value = '<img src=x onerror=alert(1)>';
  app.elements.get('topicPlatform').value = '小红书';
  app.elements.get('topicStatus').value = '创作中';
  app.elements.get('topicCopy').value = '测试文案';
  app.elements.get('topicScript').value = '开场、主体、结尾';
  app.elements.get('metricViews').value = '1200';
  app.elements.get('metricLikes').value = '31';
  app.elements.get('metricComments').value = '8';
  app.elements.get('metricSaves').value = '12';
  app.trigger('topicForm', 'submit', { preventDefault() {} });

  const [topic] = app.topics();
  assert.equal(topic.id, 'test-generated-id');
  assert.equal(topic.title, '<img src=x onerror=alert(1)>');
  assert.equal(topic.platform, '小红书');
  assert.equal(topic.status, '创作中');
  assert.equal(topic.copy, '测试文案');
  assert.equal(topic.script, '开场、主体、结尾');
  assert.deepEqual([topic.views, topic.likes, topic.comments, topic.saves], [1200, 31, 8, 12]);
  assert.match(app.elements.get('topicRows').innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.equal(app.elements.get('statTotal').textContent, '1');
});

test('normalizes negative and decimal metric input to non-negative integers', () => {
  const app = createApp();
  app.trigger('addBtn', 'click');
  app.elements.get('topicTitle').value = '边界数据';
  app.elements.get('metricViews').value = '-10';
  app.elements.get('metricLikes').value = '3.9';
  app.trigger('topicForm', 'submit', { preventDefault() {} });

  const [topic] = app.topics();
  assert.equal(topic.views, 0);
  assert.equal(topic.likes, 3);
});

test('edits an existing topic without duplicating it and keeps its creation date', () => {
  const original = { id: 'topic-1', title: '旧标题', platform: 'X', status: '未开始', copy: '', script: '', views: 0, likes: 0, comments: 0, saves: 0, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const app = createApp(JSON.stringify([original]));
  app.trigger('topicRows', 'click', { target: { closest: selector => selector === '[data-edit]' ? { dataset: { edit: 'topic-1' } } : null } });
  app.elements.get('topicTitle').value = '新标题';
  app.elements.get('topicStatus').value = '已发布';
  app.trigger('topicForm', 'submit', { preventDefault() {} });

  const topics = app.topics();
  assert.equal(topics.length, 1);
  assert.equal(topics[0].title, '新标题');
  assert.equal(topics[0].status, '已发布');
  assert.equal(topics[0].createdAt, original.createdAt);
  assert.equal(app.elements.get('statPublished').textContent, '1');
});

test('deletes a topic after confirmation and persists the empty list', () => {
  const topic = { id: 'topic-1', title: '待删除', platform: '抖音', status: '未开始', copy: '', script: '', views: 0, likes: 0, comments: 0, saves: 0 };
  const app = createApp(JSON.stringify([topic]));
  app.trigger('topicRows', 'click', { target: { closest: selector => selector === '[data-delete]' ? { dataset: { delete: 'topic-1' } } : null } });
  assert.deepEqual(app.topics(), []);
  assert.equal(app.elements.get('statTotal').textContent, '0');
});

test('search and status filters narrow the displayed topics', () => {
  const records = [
    { id: 'one', title: '旅行计划', platform: '小红书', status: '创作中', copy: '', script: '', updatedAt: '2026-01-02' },
    { id: 'two', title: '效率工具', platform: 'YouTube', status: '已发布', copy: '', script: '', updatedAt: '2026-01-01' }
  ];
  const app = createApp(JSON.stringify(records));
  app.elements.get('searchInput').value = '旅行';
  app.trigger('searchInput', 'input', { target: app.elements.get('searchInput') });
  assert.match(app.elements.get('topicRows').innerHTML, /旅行计划/);
  assert.doesNotMatch(app.elements.get('topicRows').innerHTML, /效率工具/);

  app.elements.get('searchInput').value = '';
  app.trigger('searchInput', 'input', { target: app.elements.get('searchInput') });
  app.elements.get('statusFilter').value = '已发布';
  app.trigger('statusFilter', 'change', { target: app.elements.get('statusFilter') });
  assert.match(app.elements.get('topicRows').innerHTML, /效率工具/);
  assert.doesNotMatch(app.elements.get('topicRows').innerHTML, /旅行计划/);
});

test('recovers from invalid localStorage JSON without crashing', () => {
  const app = createApp('{broken json');
  assert.deepEqual(app.topics(), []);
  assert.equal(app.elements.get('statTotal').textContent, '0');
});
