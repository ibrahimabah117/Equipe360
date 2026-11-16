import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { CompanyProvider, useCompany } from './lib/company'
import { AppShell } from './layout/AppShell'
import { PageLoader, Spinner, ToastProvider } from './ui'
import { LogoMark } from './ui/Logo'
import Login from './pages/Login'
const AdminClients = lazy(() => import('./pages/AdminClients'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Employees = lazy(() => import('./pages/Employees'))
const Sites = lazy(() => import('./pages/Sites'))
const QrPrint = lazy(() => import('./pages/QrPrint'))
const Access = lazy(() => import('./pages/Access'))
const Settings = lazy(() => import('./pages/Settings'))
import { AgentHome, CompanyNotFound, Home, PunchLanding } from './pages/Misc'

function Splash() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6">
      <LogoMark className="size-12" />
      <Spinner />
    </div>
  )
}

function ManagerOnly({ children }: { children: ReactNode }) {
  const { canManage, company } = useCompany()
  return canManage ? <>{children}</> : <Navigate to={`/c/${company.id}/moi`} replace />
}

function CompanyArea() {
  const { companyId = '' } = useParams()
  return (
    <CompanyProvider companyId={companyId} fallback={<Splash />} notFound={<CompanyNotFound />}>
      <CompanyShell />
    </CompanyProvider>
  )
}

function CompanyShell() {
  const { company, role } = useCompany()
  return (
    <AppShell companyId={company.id} companyName={company.name} role={role}>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route index element={<ManagerOnly><Dashboard /></ManagerOnly>} />
        <Route path="employes" element={<ManagerOnly><Employees /></ManagerOnly>} />
        <Route path="sites" element={<ManagerOnly><Sites /></ManagerOnly>} />
        <Route path="sites/qr" element={<ManagerOnly><QrPrint /></ManagerOnly>} />
        <Route path="acces" element={<ManagerOnly><Access /></ManagerOnly>} />
        <Route path="parametres" element={<ManagerOnly><Settings /></ManagerOnly>} />
        <Route path="moi" element={<AgentHome />} />
        <Route path="*" element={<Navigate to="." replace />} />
      </Routes>
      </Suspense>
    </AppShell>
  )
}

function Router() {
  const { session, loading, isAdmin } = useAuth()
  if (loading) return <Splash />

  if (!session) {
    return (
      <Routes>
        <Route path="/p/:token" element={<PunchLanding />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/admin"
        element={isAdmin ? <AppShell><Suspense fallback={<PageLoader />}><AdminClients /></Suspense></AppShell> : <Navigate to="/" replace />}
      />
      <Route path="/c/:companyId/*" element={<CompanyArea />} />
      <Route path="/p/:token" element={<PunchLanding />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Router />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
