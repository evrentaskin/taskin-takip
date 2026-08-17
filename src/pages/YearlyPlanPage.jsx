import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, CircularProgress, FormControl, IconButton, InputLabel,
  MenuItem, Paper, Select, Stack, Typography
} from '@mui/material'
import { CalendarMonth, ChevronLeft, ChevronRight, Today } from '@mui/icons-material'
import { useSharedCloudState } from '../services/useSharedCloudState'
import {
  currentPlanIndex, formatPlanDateRange, todayIso, YEARLY_PLAN_GRADES,
  YEARLY_PLAN_LOCAL_KEY, YEARLY_PLAN_STATE_KEY
} from '../utils/yearlyPlan'

export default function YearlyPlanPage() {
  const [plans, , cloudReady] = useSharedCloudState({
    stateKey: YEARLY_PLAN_STATE_KEY,
    localKey: YEARLY_PLAN_LOCAL_KEY,
    fallback: {}
  })
  const [grade, setGrade] = useState('5')
  const [index, setIndex] = useState(0)

  const entries = useMemo(() => Array.isArray(plans?.[grade]) ? plans[grade] : [], [plans, grade])

  function goToday() {
    setIndex(Math.max(0, currentPlanIndex(entries, todayIso())))
  }

  useEffect(() => {
    setIndex(Math.max(0, currentPlanIndex(entries, todayIso())))
  }, [grade, entries])

  const current = entries[index]
  const sameWeek = current
    ? entries.filter(item => item.startDate === current.startDate && item.endDate === current.endDate)
    : []
  const weekStartIndex = current ? entries.findIndex(item => item.startDate === current.startDate && item.endDate === current.endDate) : -1
  const nextWeekIndex = current
    ? entries.findIndex((item, itemIndex) => itemIndex > index && (item.startDate !== current.startDate || item.endDate !== current.endDate))
    : -1
  const previousWeekIndex = current
    ? entries.map((item, itemIndex) => ({ item, itemIndex }))
      .filter(({ item, itemIndex }) => itemIndex < weekStartIndex && (item.startDate !== current.startDate || item.endDate !== current.endDate))
      .at(-1)?.itemIndex ?? -1
    : -1

  if (!cloudReady) return <Box className="loader compact"><CircularProgress /></Box>

  return (
    <Box>
      <Box className="page-head">
        <Box>
          <Typography variant="h4" fontWeight={950}>Yıllık Plan</Typography>
          <Typography color="text.secondary">Sınıf defteri için haftalık Fen Bilimleri kazanımları</Typography>
        </Box>
      </Box>

      <Paper className="glass yearly-plan-toolbar" elevation={0}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Sınıf</InputLabel>
            <Select value={grade} label="Sınıf" onChange={event => setGrade(event.target.value)}>
              {YEARLY_PLAN_GRADES.map(item => <MenuItem key={item} value={item}>{item}. Sınıf</MenuItem>)}
            </Select>
          </FormControl>
          <Button variant="outlined" startIcon={<Today />} onClick={goToday} disabled={!entries.length}>
            Bugünkü Haftaya Dön
          </Button>
        </Stack>
      </Paper>

      {!entries.length ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          {grade}. sınıf yıllık planı yüklenmemiş. Ayarlar → Yıllık Plan Yönetimi bölümünden Excel dosyasını yükleyebilirsin.
        </Alert>
      ) : (
        <Paper className="glass yearly-plan-card" elevation={0} sx={{ mt: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <IconButton
              aria-label="Önceki haftaya git"
              onClick={() => previousWeekIndex >= 0 && setIndex(previousWeekIndex)}
              disabled={previousWeekIndex < 0}
              size="large"
            >
              <ChevronLeft fontSize="large" />
            </IconButton>

            <Box sx={{ textAlign: 'center', minWidth: 0 }}>
              <CalendarMonth color="primary" sx={{ mb: .5 }} />
              <Typography variant="h6" fontWeight={900}>
                {formatPlanDateRange(current.startDate, current.endDate)}
              </Typography>
              {current.startDate <= todayIso() && current.endDate >= todayIso() && (
                <Typography variant="caption" color="primary" fontWeight={900}>BU HAFTA</Typography>
              )}
            </Box>

            <IconButton
              aria-label="Sonraki haftaya git"
              onClick={() => nextWeekIndex >= 0 && setIndex(nextWeekIndex)}
              disabled={nextWeekIndex < 0}
              size="large"
            >
              <ChevronRight fontSize="large" />
            </IconButton>
          </Stack>

          <Stack spacing={2} sx={{ mt: 3 }}>
            {sameWeek.map((item, itemIndex) => (
              <Box key={item.id || `${item.startDate}-${itemIndex}`} className="yearly-plan-outcome">
                {item.unit && (
                  <>
                    <Typography variant="overline" color="text.secondary" fontWeight={900}>ÜNİTE / KONU</Typography>
                    <Typography fontWeight={850} sx={{ mb: 1 }}>{item.unit}</Typography>
                  </>
                )}
                <Typography variant="overline" color="text.secondary" fontWeight={900}>KAZANIM</Typography>
                <Typography sx={{ whiteSpace: 'pre-wrap', fontSize: { xs: '1rem', sm: '1.08rem' } }}>{item.outcome}</Typography>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}
    </Box>
  )
}
