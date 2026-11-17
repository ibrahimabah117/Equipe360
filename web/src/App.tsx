import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { CompanyProvider, useCompany } from './lib/company'
import { AppShell } from './layout/AppShell'
import { PageLoader, Spinner, ToastProvider } from './ui'
import { LogoMark } from './ui/Logo'
import RealLogin from './pages/Login'
import DemoLogin, { DemoBar } from './demo/DemoLogin'
import { DEMO } from './lib/supabase'

const Login = DEMO ? DemoLogin : RealLogin
const Router_ = DEMO ? HashRouter : BrowserRouter
const AdminClients = lazy(() => import('./pages/AdminClients'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Employees = lazy(() => import('./pages/Employees'))
const Sites = lazy(() => import('./pages/Sites'))
const QrPrint = lazy(() => import('./pages/QrPrint'))
const Access = lazy(() => import('./pages/Access'))
const Settings = lazy(() => import('./pages/Settings'))
const Planning = lazy(() => import('./pages/Planning'))
const Attendance = lazy(() => import('./pages/Attendance'))
const Payroll = lazy(() => import('./pages/Payroll'))
const PayslipPrint = lazy(() => import('./pages/PayslipPrint'))
const PunchPage = lazy(() => import('./pages/Punch').then((m) => ({ default: m.PunchPage })))
const ScanPage = lazy(() => import('./pages/Punch').then((m) => ({ default: m.ScanPage })))
import { AgentHome, CompanyNotFound, Home } from './pages/Misc'

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
        <Route path="planning" element={<ManagerOnly><Planning /></ManagerOnly>} />
        <Route path="pointages" element={<ManagerOnly><Attendance /></ManagerOnly>} />
        <Route path="paie" element={<ManagerOnly><Payroll /></ManagerOnly>} />
        <Route path="paie/:period/fiches" element={<PayslipPrint />} />
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
        <Route path="/p/:token" element={<Login hint="Connectez-vous pour pointer sur ce site." />} />
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <>
    {DEMO && <DemoBar />}
    <Routes>
      <Route path="/" element={<Home />} />
      <Route
        path="/admin"
        element={isAdmin ? <AppShell><Suspense fallback={<PageLoader />}><AdminClients /></Suspense></AppShell> : <Navigate to="/" replace />}
      />
      <Route path="/c/:companyId/*" element={<CompanyArea />} />
      <Route path="/p/:token" element={<Suspense fallback={<Splash />}><PunchPage /></Suspense>} />
      <Route path="/scan" element={<Suspense fallback={<Splash />}><ScanPage /></Suspense>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  )
}

export default function App() {
  return (
    <Router_>
      <AuthProvider>
        <ToastProvider>
          <Router />
        </ToastProvider>
      </AuthProvider>
    </Router_>
  )
}
