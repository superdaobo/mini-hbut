const SEMESTER_RE = /^(\d{4})-(\d{4})-([12])$/

const parseSemester = (semester) => {
  const text = String(semester || '').trim()
  const m = text.match(SEMESTER_RE)
  if (!m) return null
  const startYear = Number(m[1])
  const endYear = Number(m[2])
  const term = Number(m[3])
  if (!Number.isFinite(startYear) || !Number.isFinite(endYear) || !Number.isFinite(term)) {
    return null
  }
  return { text, startYear, endYear, term }
}

const weight = (parsed) => parsed.startYear * 10 + parsed.term

export const compareSemesterDesc = (a, b) => {
  const pa = parseSemester(a)
  const pb = parseSemester(b)
  if (pa && pb) {
    if (pa.startYear !== pb.startYear) return pb.startYear - pa.startYear
    if (pa.term !== pb.term) return pb.term - pa.term
    return String(b).localeCompare(String(a))
  }
  if (pa && !pb) return -1
  if (!pa && pb) return 1
  return String(b).localeCompare(String(a))
}

export const normalizeSemesterList = (list) => {
  const seen = new Set()
  const out = []
  for (const item of Array.isArray(list) ? list : []) {
    const sem = String(item || '').trim()
    if (!sem || seen.has(sem)) continue
    seen.add(sem)
    out.push(sem)
  }
  out.sort(compareSemesterDesc)
  return out
}

export const readStoredScheduleSemester = () => {
  try {
    const raw = localStorage.getItem('hbu_schedule_meta')
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    return String(parsed?.semester || '').trim()
  } catch {
    return ''
  }
}

export const deriveSemesterByDate = (date = new Date()) => {
  const today = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(today.getTime())) return ''
  const year = today.getFullYear()
  const month = today.getMonth() + 1
  const day = today.getDate()

  let academicYearStart = year - 1
  let term = 1
  if (month >= 9) {
    academicYearStart = year
    term = 1
  } else if (month >= 3 || (month === 2 && day >= 15)) {
    academicYearStart = year - 1
    term = 2
  }

  return `${academicYearStart}-${academicYearStart + 1}-${term}`
}

export const getPreferredSemesterFast = (date = new Date()) => {
  const stored = readStoredScheduleSemester()
  if (parseSemester(stored)) return stored
  return deriveSemesterByDate(date)
}

export const mergeSemesterOptions = (list, selectedSemester = '') => {
  const merged = normalizeSemesterList(list)
  const selected = String(selectedSemester || '').trim()
  if (selected && !merged.includes(selected)) {
    merged.push(selected)
  }
  return normalizeSemesterList(merged)
}

export const resolveCurrentSemester = (semesterList, hintedCurrent = '') => {
  const list = normalizeSemesterList(semesterList)
  if (!list.length) return ''
  const hinted = String(hintedCurrent || '').trim()
  if (hinted && list.includes(hinted)) return hinted
  const stored = readStoredScheduleSemester()
  if (stored && list.includes(stored)) return stored
  return list[0]
}

export const semesterIsNewer = (a, b) => {
  const pa = parseSemester(a)
  const pb = parseSemester(b)
  if (!pa && !pb) return false
  if (pa && !pb) return true
  if (!pa && pb) return false
  return weight(pa) > weight(pb)
}
