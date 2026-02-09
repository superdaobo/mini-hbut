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

const readStoredSemester = () => {
  try {
    const raw = localStorage.getItem('hbu_schedule_meta')
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    return String(parsed?.semester || '').trim()
  } catch {
    return ''
  }
}

export const resolveCurrentSemester = (semesterList, hintedCurrent = '') => {
  const list = normalizeSemesterList(semesterList)
  if (!list.length) return ''
  const hinted = String(hintedCurrent || '').trim()
  if (hinted && list.includes(hinted)) return hinted
  const stored = readStoredSemester()
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
