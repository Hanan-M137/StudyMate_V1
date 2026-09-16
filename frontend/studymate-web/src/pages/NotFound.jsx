import { Link } from 'react-router-dom'
import { useI18n } from '../context/I18nContext'
import { EmptyState } from '../components/ui'

export default function NotFound() {
  const { t } = useI18n()

  return (
    <EmptyState
      title={t('notfound.title')}
      description={t('notfound.description')}
      action={
        <Link
          to="/documents"
          className="inline-flex h-10 items-center rounded-sm bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          {t('notfound.backToDocuments')}
        </Link>
      }
    />
  )
}
