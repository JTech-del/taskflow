# TaskFlow

TaskFlow is a client-side task management dashboard built with React, Vite, and Tailwind CSS v4. Tasks are stored in the browser's localStorage; the application has no backend, accounts, or cloud synchronization.

## Features

- Create, edit, complete, reopen, and delete tasks
- Search and filter by task details, status, priority, and deadline state
- Calendar month navigation, date selection, and due-date task views
- Dashboard totals and upcoming deadlines derived from the task list
- Versioned local storage with protected-data recovery and save retry behavior

## Development

Install dependencies and start the local development server:

```sh
npm install
npm run dev
```

## Checks

```sh
npm run test
npm run lint
npm run build
```