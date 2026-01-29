import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { paths, taskDetailsPath } from '@/app/router/paths'
import { taskRepo } from '@/entities/task/lib/taskRepo'
import { useI18n } from '@/shared/i18n/I18nContext'
import './edit-task.css'

type FormState = {
  titleEn: string
  titleRu: string
  shortEn: string
  shortRu: string
  descEn: string
  descRu: string
}

export function EditTaskPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { taskId } = useParams()

  const task = useMemo(() => (taskId ? taskRepo.getById(taskId) : null), [taskId])
  const [form, setForm] = useState<FormState>(() => ({
    titleEn: task?.title.en ?? '',
    titleRu: task?.title.ru ?? '',
    shortEn: task?.shortDescription.en ?? '',
    shortRu: task?.shortDescription.ru ?? '',
    descEn: task?.description.en ?? '',
    descRu: task?.description.ru ?? '',
  }))

  if (!taskId || !task) {
    return (
      <main style={{ padding: 24 }}>
        <h1>{t('task.details.notFound')}</h1>
        <p>
          <Link to={paths.tasks}>{t('task.details.backToTasks')}</Link>
        </p>
      </main>
    )
  }

  const id = taskId

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    taskRepo.update(id, (prev) => ({
      ...prev,
      title: { en: form.titleEn.trim(), ru: form.titleRu.trim() },
      shortDescription: { en: form.shortEn.trim(), ru: form.shortRu.trim() },
      description: { en: form.descEn.trim(), ru: form.descRu.trim() },
    }))

    navigate(taskDetailsPath(id))
  }

  return (
    <div className="editTaskPage">
      <div className="editTaskCard">
        <h1 className="editTaskTitle">{t('task.edit.title')}</h1>

        <form onSubmit={onSubmit}>
          <div className="langGrid">
            <section className="langSection" aria-label={t('task.edit.section.en')}>
              <h2 className="langSection__title">{t('task.edit.section.en')}</h2>

              <label className="field">
                <span className="field__label">{t('task.create.titleField')}</span>
                <input
                  className="field__input"
                  value={form.titleEn}
                  onChange={(e) => setField('titleEn', e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field__label">{t('task.create.shortDescription')}</span>
                <textarea
                  className="field__textarea"
                  value={form.shortEn}
                  onChange={(e) => setField('shortEn', e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field__label">{t('task.create.fullDescription')}</span>
                <textarea
                  className="field__textarea"
                  value={form.descEn}
                  onChange={(e) => setField('descEn', e.target.value)}
                />
              </label>
            </section>

            <section className="langSection" aria-label={t('task.edit.section.ru')}>
              <h2 className="langSection__title">{t('task.edit.section.ru')}</h2>

              <label className="field">
                <span className="field__label">{t('task.create.titleField')}</span>
                <input
                  className="field__input"
                  value={form.titleRu}
                  onChange={(e) => setField('titleRu', e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field__label">{t('task.create.shortDescription')}</span>
                <textarea
                  className="field__textarea"
                  value={form.shortRu}
                  onChange={(e) => setField('shortRu', e.target.value)}
                />
              </label>

              <label className="field">
                <span className="field__label">{t('task.create.fullDescription')}</span>
                <textarea
                  className="field__textarea"
                  value={form.descRu}
                  onChange={(e) => setField('descRu', e.target.value)}
                />
              </label>
            </section>
          </div>

          <div className="actionsRow">
            <button className="primaryBtn" type="submit">
              {t('task.edit.save')}
            </button>
            <Link className="secondaryLink" to={taskDetailsPath(id)}>
              {t('common.cancel')}
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}

