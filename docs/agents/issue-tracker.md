# Issue tracker

Локальные markdown-файлы, не GitHub — репозиторий пока без remote.

Тикеты живут как файлы под `.scratch/<feature-slug>/issues/<NN>-<slug>.md`,
нумерация с `01` в порядке зависимостей (блокирующие раньше). Каждый файл — один
тикет, по шаблону из `to-tickets` (`<local-ticket-template>`).

`.scratch/` не коммитится — это рабочая очередь, не документация; добавь в
`.gitignore`, если ещё не там.

## Переход на GitHub

Когда репозиторий подключат к GitHub (`git remote add origin ...`) и выполнят
`gh auth login`, поменяйте этот файл на:

```markdown
# Issue tracker

GitHub Issues, через `gh issue create` / `gh issue list` / `gh issue edit`.

Триаж-лейблы: не настроены (скилл `triage` не установлен) — `ready-for-agent`
и другие ярлыки из шаблона `to-tickets` не применяются.
```

Существующие файлы из `.scratch/` при желании перенести вручную:
`gh issue create --title "..." --body-file .scratch/<feature>/issues/01-....md`.
