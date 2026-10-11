import { tagName, tagPlan } from './author-tags.js';
import { readTagEntries, saveTagPlan } from './author-tags-api.js';

const element = (tag, text = '', attrs = {}) => {
  const node = document.createElement(tag); node.textContent = text;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
};

export async function openTagEditor(api, from) {
  if (!api || document.querySelector('.author-tag-dialog')) return;
  const dialog = element('dialog', '', { class: 'author-tag-dialog', 'aria-labelledby': 'author-tag-heading' });
  dialog.append(element('h2', 'Править тему', { id: 'author-tag-heading' }));
  dialog.append(element('p', `Сейчас: ${from}`, { class: 'author-tag-current' }));
  const form = element('form');
  const label = element('label', '', { class: 'author-field' });
  label.append(element('span', 'Новое название'));
  const input = element('input', '', { name: 'tag', type: 'text', autocomplete: 'off', required: '' }); input.value = from;
  label.append(input); form.append(label);
  form.append(element('p', 'Если такая тема уже есть, записи объединятся в одну подборку. Текст и фотографии останутся на месте.', { class: 'author-photo-hint' }));
  const preview = element('div', '', { class: 'author-tag-preview' });
  const status = element('p', '', { class: 'author-status', role: 'status' });
  const actions = element('div', '', { class: 'author-tag-actions' });
  const check = element('button', 'Проверить изменения', { type: 'submit' });
  const save = element('button', api.session.type === 'local' ? 'Сохранить локально' : 'Сохранить и опубликовать', { type: 'button', class: 'author-primary', hidden: '' });
  const close = element('button', 'Отмена', { type: 'button' });
  actions.append(check, save, close); form.append(preview, actions, status); dialog.append(form);
  let snapshot, plan, busy = false, completed = false;
  const dismiss = () => { if (!busy) { dialog.close(); dialog.remove(); } };
  close.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => dialog.remove());
  const reset = () => { plan = null; save.hidden = true; preview.replaceChildren(); status.textContent = ''; check.hidden = false; };
  input.addEventListener('input', reset);
  const lock = value => { busy = value; input.disabled = check.disabled = save.disabled = close.disabled = value; };
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy || completed) return;
    reset(); lock(true); status.textContent = 'Проверяю записи…';
    try {
      const to = tagName(input.value);
      if (to === from) throw new Error('Введи новое название темы.');
      snapshot = await readTagEntries(api); plan = tagPlan(snapshot.entries, from, to);
      if (!plan.changes.length) throw new Error('Записей с этой темой больше нет. Обнови страницу.');
      preview.append(element('h3', plan.merge ? `Объединить «${from}» с «${to}»` : `Переименовать «${from}» в «${to}»`));
      preview.append(element('p', `Изменятся записи: ${plan.changes.length}`));
      const list = element('ul');
      for (const item of plan.changes) list.append(element('li', `${item.title || item.path}${item.draft ? ' · скрытая запись' : ''}`));
      preview.append(list); check.hidden = true; save.hidden = false;
      status.textContent = api.session.type === 'local' ? 'Изменения сохранятся на этом компьютере. Пуш выполняется отдельно.' : 'Сохранение обновит записи в GitHub и запустит публикацию сайта.';
    } catch (error) { status.textContent = error.message; } finally { lock(false); }
  });
  save.addEventListener('click', async () => {
    if (busy || !plan || completed) return;
    lock(true); status.textContent = 'Сохраняю тему…';
    try {
      const result = await saveTagPlan(api, snapshot, plan);
      completed = true; input.disabled = true; save.hidden = check.hidden = true;
      const destination = `/tags/${encodeURIComponent(plan.to)}/`;
      status.textContent = result.local ? `Готово. Обновлено записей: ${result.count}. Изменения сохранены локально.` : `Готово. Обновлено записей: ${result.count}. Netlify собирает сайт; новая тема появится после публикации.`;
      preview.replaceChildren(element('h3', plan.to));
      if (result.local) preview.append(element('a', 'Открыть обновлённую тему →', { href: destination, 'data-astro-reload': '' }));
      else preview.append(element('a', 'Перейти к темам →', { href: '/tags/', 'data-astro-reload': '' }));
      close.textContent = 'Закрыть';
      // Astro reloads changed content in dev; move off the old tag before it disappears.
      if (result.local) location.assign(destination);
    } catch (error) { reset(); status.textContent = error.message; }
    finally { lock(false); if (completed) input.disabled = true; }
  });
  document.body.append(dialog); dialog.showModal(); input.focus(); input.select();
}
