import LoginForm from '@/components/LoginForm'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-sm">
        <h1 className="text-2xl font-bold text-slate-800 mb-2">Vikartavle</h1>
        <p className="text-slate-500 mb-8">Logg inn som administrator</p>
        <LoginForm />
      </div>
    </div>
  )
}
