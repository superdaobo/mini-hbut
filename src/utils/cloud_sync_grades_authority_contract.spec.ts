import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('cloud sync grades authority contract', () => {
  it('treats Array latestGrades (including empty) as full authority without unioning local cache', () => {
    const source = readText('src/utils/cloud_sync.js')
    const buildBlock =
      source.match(
        /const buildGradeSnapshot = \(studentId, latestGrades = undefined\) => \{[\s\S]*?^const replaceAuthoritativeGradeCaches/m
      )?.[0] || ''

    expect(buildBlock).toContain('const hasAuthoritativeList = Array.isArray(latestGrades)')
    expect(buildBlock).not.toContain('latestGrades.length > 0')
    expect(buildBlock).toContain('if (hasAuthoritativeList)')
    expect(buildBlock).toContain('return accumulateGradeSnapshot(sourceEntries)')

    // 有权威列表时 early return，不得再 readCachedEntriesByPrefix 做并集
    const authoritativeBranch = buildBlock.split('if (hasAuthoritativeList)')[1] || ''
    const beforeFallback = authoritativeBranch.split('readCachedEntriesByPrefix')[0] || ''
    expect(beforeFallback).toContain('return accumulateGradeSnapshot(sourceEntries)')
    expect(beforeFallback).not.toContain('readCachedEntriesByPrefix')
  })

  it('replaces local grade caches via clearCacheByPrefix before rewriting shards', () => {
    const source = readText('src/utils/cloud_sync.js')
    const replaceBlock =
      source.match(
        /const replaceAuthoritativeGradeCaches = \(studentId, grades = \[\]\) => \{[\s\S]*?^const normalizePersonalInfoPayload/m
      )?.[0] || ''

    expect(replaceBlock).toContain('clearCacheByPrefix(`grades:${sid}`)')
    expect(replaceBlock).toContain('accumulateGradeSnapshot([{ semester: \'\', list }])')
    expect(replaceBlock).toContain('setCachedData(`grades:${sid}`, { success: true, data: gradesSnapshot.all })')
    expect(replaceBlock).toContain('setCachedData(`grades:${sid}:${sem}`, { success: true, data: gradeList })')
    // 不得再经 buildGradeSnapshot(sid, list) 以免空数组误回退本地
    expect(replaceBlock).not.toContain('buildGradeSnapshot(sid, list)')
  })

  it('primes academic caches with null-check so empty authority still replaces', () => {
    const source = readText('src/utils/cloud_sync.js')
    const primeBlock =
      source.match(
        /const primeAcademicCaches = async \(studentId, seedGrades = \[\], options = \{\}\) => \{[\s\S]*?^const shouldAttachChallenge/m
      )?.[0] || ''

    expect(primeBlock).toContain('authoritativeGrades')
    expect(primeBlock).toContain('authoritativeGrades != null')
    expect(primeBlock).toContain('replaceAuthoritativeGradeCaches(sid, authoritativeGrades)')
    expect(primeBlock).toContain('buildGradeSnapshot(sid)')
    expect(primeBlock).not.toMatch(
      /const gradesSnapshot = buildGradeSnapshot\(sid, grades\)\s*\n\s*if \(gradesSnapshot\.all\.length > 0\)/
    )
  })

  it('applies cloud academic grades via authoritative replace instead of raw setCachedData merge', () => {
    const source = readText('src/utils/cloud_sync.js')
    const applyBlock =
      source.match(
        /const applyAcademicFromCloud = \(studentId, academic\) => \{[\s\S]*?^const extractCloudData/m
      )?.[0] || ''

    expect(applyBlock).toContain('hasCloudGradesPayload')
    expect(applyBlock).toContain('replaceAuthoritativeGradeCaches(sid, mergedGrades)')
    // 旧路径：按学期直接 setCachedData 分片 + 主 key 并集写回
    expect(applyBlock).not.toContain('setCachedData(`grades:${sid}:${sem}`, { success: true, data: gradeList })')
    expect(applyBlock).not.toContain('setCachedData(`grades:${sid}`, { success: true, data: mergedGrades })')
  })

  it('imports clearCacheByPrefix for grade authority replace', () => {
    const source = readText('src/utils/cloud_sync.js')
    expect(source).toMatch(
      /import\s*\{\s*clearCacheByPrefix\s*,\s*setCachedData\s*\}\s*from\s*['"]\.\/api\.js['"]/
    )
  })
})
