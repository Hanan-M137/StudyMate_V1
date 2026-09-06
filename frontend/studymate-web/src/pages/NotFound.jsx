import { Link } from 'react-router-dom'
import { EmptyState } from '../components/ui'

export default function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="That route does not exist in StudyMate."
      action={
        <Link
          to="/documents"
          className="inline-flex h-10 items-center rounded-sm bg-accent px-4 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
        >
          Back to documents
        </Link>
      }
    />
  )
}
