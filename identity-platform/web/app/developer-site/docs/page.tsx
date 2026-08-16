import { redirect } from 'next/navigation'
import { OFFICIAL_IDENTITY_DOCS_URL } from '@/lib/developer/docs'

export default function DeveloperDocsRedirectPage() {
  redirect(OFFICIAL_IDENTITY_DOCS_URL)
}
