import { Box, Typography } from '@mui/material'
import { Construction } from '@mui/icons-material'

export default function ModulePage({ title, description }) {
  return (
    <Box>
      <Box className="page-head">
        <Box>
          <Typography variant="h4" fontWeight={950}>{title}</Typography>
          <Typography color="text.secondary">{description}</Typography>
        </Box>
      </Box>
      <Box className="glass empty">
        <Construction sx={{ fontSize: 64 }} />
        <Typography variant="h6" fontWeight={900}>{title} modülü</Typography>
        <Typography color="text.secondary">
          Öğretmen paneli altyapısına bağlandı. Veri giriş ekranı sıradaki geliştirme adımında açılacak.
        </Typography>
      </Box>
    </Box>
  )
}
