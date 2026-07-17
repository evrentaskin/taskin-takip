import { useEffect, useState } from 'react'
import {
  AppBar, Avatar, Box, Button, CircularProgress, Divider, Drawer,
  IconButton, List, ListItemButton, ListItemIcon, ListItemText,
  Toolbar, Typography
} from '@mui/material'
import {
  Campaign, Dashboard, EmojiEvents, Folder, Groups, Logout, Menu, NoteAlt, Psychology, Quiz, School, Settings, Star, Storage
} from '@mui/icons-material'
import { supabase } from './services/supabase'
import LoginPage from './pages/LoginPage'
import StudentsPage from './pages/StudentsPage'
import LgsPage from './pages/LgsPage'
import DashboardPage from './pages/DashboardPage'
import ModulePage from './pages/ModulePage'
import SettingsPage from './pages/SettingsPage'
import HomeworkPage from './pages/HomeworkPage'
import ExamsPage from './pages/ExamsPage'
import PlusPage from './pages/PlusPage'
import ExamGradesPage from './pages/ExamGradesPage'
import ProjectsPage from './pages/ProjectsPage'
import CommentsPage from './pages/CommentsPage'
import AnnouncementsPage from './pages/AnnouncementsPage'
import StudentHomePage from './pages/StudentHomePage'
import ReportsPage from './pages/ReportsPage'
import StudentDetailPage from './pages/StudentDetailPage'

const drawerWidth = 258

export default function App() {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState('Ana Sayfa')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession)
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
      <List sx={{ px: 1 }}>
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
      <Box sx={{ flex: 1 }} />
      <Button startIcon={<Logout />} onClick={() => supabase.auth.signOut()}>
        Çıkış
      </Button>
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
          <Typography variant="caption" fontWeight={800}>V7.4</Typography>
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
      </Box>

      <Box className="ai-fab"><Psychology /></Box>
    </Box>
  )
}

function CenterLoader() {
  return <Box className="loader"><CircularProgress /></Box>
}
