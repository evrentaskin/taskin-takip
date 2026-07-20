import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import {
  AppBar, Avatar, Box, Button, CircularProgress, Divider, Drawer,
  IconButton, List, ListItemButton, ListItemIcon, ListItemText,
  Toolbar, Typography
} from '@mui/material'
import {
  Campaign, CalendarMonth, Dashboard, EmojiEvents, EventSeat, Folder, Groups, Menu, NoteAlt, Psychology, Quiz, School, Settings, Star, Storage, PersonPin
} from '@mui/icons-material'
import { supabase } from './services/supabase'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import StudentHomePage from './pages/StudentHomePage'

const StudentsPage = lazy(() => import('./pages/StudentsPage'))
const LgsPage = lazy(() => import('./pages/LgsPage'))
const ModulePage = lazy(() => import('./pages/ModulePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const HomeworkPage = lazy(() => import('./pages/HomeworkPage'))
const ExamsPage = lazy(() => import('./pages/ExamsPage'))
const PlusPage = lazy(() => import('./pages/PlusPage'))
const ExamGradesPage = lazy(() => import('./pages/ExamGradesPage'))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'))
const CommentsPage = lazy(() => import('./pages/CommentsPage'))
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'))
const ReportsPage = lazy(() => import('./pages/ReportsPage'))
const StudentDetailPage = lazy(() => import('./pages/StudentDetailPage'))
const SeatingPlanPage = lazy(() => import('./pages/SeatingPlanPage'))
const YearlyPlanPage = lazy(() => import('./pages/YearlyPlanPage'))
const PrivateLessonsPage = lazy(() => import('./pages/PrivateLessonsPage'))

const drawerWidth = 258

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('Ana Sayfa')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState(null)
  const pageRef = useRef(page)

  useEffect(() => {
    pageRef.current = page
  }, [page])

  useEffect(() => {
    const openHome = () => {
      setPage('Ana Sayfa')
      setSelectedStudentId(null)
      setMobileOpen(false)
    }

    openHome()
    const handlePageShow = (event) => {
      if (event.persisted) openHome()
    }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  useEffect(() => {
    const disableSuggestions = (root = document) => {
      root.querySelectorAll?.('input, textarea').forEach((field) => {
        if (field.type === 'file' || field.type === 'checkbox' || field.type === 'radio') return
        field.setAttribute('autocomplete', field.type === 'password' ? 'new-password' : 'off')
        field.setAttribute('autocorrect', 'off')
        field.setAttribute('autocapitalize', 'none')
        field.setAttribute('spellcheck', 'false')
        field.setAttribute('data-form-type', 'other')
      })
      root.querySelectorAll?.('form').forEach((form) => form.setAttribute('autocomplete', 'off'))
    }

    disableSuggestions()
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            disableSuggestions(node)
            if (node.matches?.('input, textarea, form')) disableSuggestions(node.parentElement || document)
          }
        })
      })
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 899px)').matches
    if (!isMobile) return undefined

    const handlePopState = () => {
      if (pageRef.current !== 'Ana Sayfa') {
        setPage('Ana Sayfa')
        setSelectedStudentId(null)
        setMobileOpen(false)
      }
      // Ana sayfadayken ikinci geri basışında tarayıcının normal çıkışına izin verilir.
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 899px)').matches
    if (!isMobile || page === 'Ana Sayfa') return
    if (!window.history.state?.taskinPageGuard) {
      window.history.pushState({ taskinPageGuard: true }, '', window.location.href)
    }
  }, [page])

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      setPage('Ana Sayfa')
      setSelectedStudentId(null)
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession)
      setPage('Ana Sayfa')
      setSelectedStudentId(null)
      if (nextSession) await loadProfile(nextSession.user.id)
      else setProfile(null)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', userId)
      .single()
    setProfile(data)
  }

  if (loading) return <CenterLoader />
  if (!session) return <LoginPage />
  if (profile?.role === 'student') return <StudentHomePage session={session} profile={profile} />

  const menuItems = [
    ['Ana Sayfa', Dashboard],
    ['Öğrenciler', Groups],
    ['LGS Grubu', EmojiEvents],
    ['Ödevler', School],
    ['Denemeler', Quiz],
    ['Artı', Star],
    ['Sınav Notları', NoteAlt],
    ['Proje', Folder],
    ['Yorum', Psychology],
    ['Duyuru', Campaign],
    ['Raporlar', Storage],
    ['Yıllık Plan', CalendarMonth],
    ['Oturma Planı', EventSeat],
    ['Özel Dersler', PersonPin],
    ['Ayarlar', Settings],
  ]

  const drawer = (
    <Box className="drawer">
      <Box className="brand">
        <img className="brand-logo-image" src="/taskin-takip-sistemi-logo.png" alt="Taşkın Takip Sistemi logosu" />
        <Box>
          <Typography fontWeight={900}>TAŞKIN</Typography>
          <Typography variant="caption">Takip Sistemi</Typography>
        </Box>
      </Box>
      <Divider sx={{ my: 1.5 }} />
      <List sx={{ px: 1, flex: 1, minHeight: 0, overflowY: 'auto', pb: 2 }}>
        {menuItems.map(([label, Icon]) => (
          <ListItemButton
            key={label}
            selected={page === label}
            onClick={() => { setPage(label); setMobileOpen(false) }}
            className="nav-item"
          >
            <ListItemIcon><Icon fontSize="small" /></ListItemIcon>
            <ListItemText primary={label} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  )

  return (
    <Box className="app">
      {page !== 'Ana Sayfa' && <AppBar className="topbar" elevation={0}>
        <Toolbar>
          <IconButton onClick={() => setMobileOpen(true)} sx={{ display: { md: 'none' } }}>
            <Menu />
          </IconButton>
          <Typography variant="h6" fontWeight={900}>{page}</Typography>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" fontWeight={800}>V9.1</Typography>
        </Toolbar>
      </AppBar>}

      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth } }}
      >
        {drawer}
      </Drawer>

      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': { width: drawerWidth, border: 0 }
        }}
      >
        {drawer}
      </Drawer>

      <Box component="main" className={page === 'Ana Sayfa' ? 'main main-home' : 'main'}>
        {page !== 'Ana Sayfa' && <Toolbar />}
        <Suspense fallback={<PageLoader />}>
        {page === 'Ana Sayfa' ? (
          <DashboardPage
            onNavigate={setPage}
            onOpenStudent={(id) => { setSelectedStudentId(id); setPage('Öğrenci Detayı') }}
            onOpenMenu={() => setMobileOpen(true)}
            onLogout={() => supabase.auth.signOut()}
          />
        ) : page === 'Öğrenci Detayı' ? (
          <StudentDetailPage studentId={selectedStudentId} onBack={() => setPage('Ana Sayfa')} />
        ) : page === 'Öğrenciler' ? (
          <StudentsPage />
        ) : page === 'Yıllık Plan' ? (
          <YearlyPlanPage />
        ) : page === 'Oturma Planı' ? (
          <SeatingPlanPage />
        ) : page === 'Özel Dersler' ? (
          <PrivateLessonsPage />
        ) : page === 'LGS Grubu' ? (
          <LgsPage />
        ) : page === 'Ödevler' ? (
          <HomeworkPage />
        ) : page === 'Denemeler' ? (
          <ExamsPage />
        ) : page === 'Artı' ? (
          <PlusPage />
        ) : page === 'Sınav Notları' ? (
          <ExamGradesPage />
        ) : page === 'Proje' ? (
          <ProjectsPage />
        ) : page === 'Yorum' ? (
          <CommentsPage />
        ) : page === 'Duyuru' ? (
          <AnnouncementsPage />
        ) : page === 'Raporlar' ? (
          <ReportsPage />
        ) : page === 'Ayarlar' ? (
          <SettingsPage />
        ) : (
          <ModulePage
            title={page}
            description={{
              'Ödevler': 'Ödev oluşturma ve teslim takibi',
              'Denemeler': 'Fen ve genel deneme yönetimi',
              'Artı': 'Öğrenci artı puan sistemi',
              'Sınav Notları': 'Sınav ve ders notları',
              'Proje': 'Proje ve performans görevleri',
              'Yorum': 'Öğrenci gelişim yorumları',
              'Duyuru': 'Öğrencilere duyuru gönderimi',
              'Raporlar': 'Analiz, grafik ve çıktı merkezi',
              'Ayarlar': 'Uygulama ve hesap ayarları'
            }[page] || 'Modül yönetimi'}
          />
        )}
        </Suspense>
      </Box>

      <Box className="ai-fab"><Psychology /></Box>
    </Box>
  )
}

function CenterLoader() {
  return <Box className="loader"><CircularProgress /></Box>
}

function PageLoader() {
  return <Box sx={{ minHeight: 260, display: 'grid', placeItems: 'center' }}><CircularProgress size={34} /></Box>
}
