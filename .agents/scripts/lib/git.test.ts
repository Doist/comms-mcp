import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { branchBase, defaultBranchRef } from './git.ts'
import { createTempRepo, type TempRepo } from './test-repo.ts'

// The base verify measures a branch against. One repo; each test sets the refs it needs.
let repo: TempRepo
let first: string
let second: string

beforeAll(() => {
    repo = createTempRepo()
    repo.write('a.txt', '1\n')
    repo.git(['add', '.'])
    repo.git(['commit', '--quiet', '-m', 'first'])
    first = repo.git(['rev-parse', 'HEAD']).stdout.trim()
    repo.write('a.txt', '2\n')
    repo.git(['commit', '--quiet', '-am', 'second'])
    second = repo.git(['rev-parse', 'HEAD']).stdout.trim()
    repo.git(['switch', '--quiet', '-c', 'feature'])
})

afterAll(() => repo.cleanup())

beforeEach(() => {
    repo.git(['symbolic-ref', '--delete', 'refs/remotes/origin/HEAD'])
    for (const ref of ['refs/remotes/origin/main', 'refs/remotes/origin/trunk']) {
        repo.git(['update-ref', '-d', ref])
    }
    repo.git(['update-ref', 'refs/heads/main', second])
})

describe('defaultBranchRef', () => {
    it("prefers origin/HEAD's target", () => {
        repo.git(['update-ref', 'refs/remotes/origin/trunk', first])
        repo.git(['update-ref', 'refs/remotes/origin/main', second])
        repo.git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk'])
        expect(defaultBranchRef(repo.dir)).toBe('refs/remotes/origin/trunk')
        expect(branchBase(repo.dir)).toBe(first)
    })

    it('falls back to origin/main, ahead of a local main', () => {
        repo.git(['update-ref', 'refs/remotes/origin/main', first])
        expect(defaultBranchRef(repo.dir)).toBe('refs/remotes/origin/main')
    })

    it('skips an origin/HEAD that points at a missing ref', () => {
        repo.git(['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/gone'])
        expect(defaultBranchRef(repo.dir)).toBe('refs/heads/main')
    })

    it('uses a local main without a remote', () => {
        expect(defaultBranchRef(repo.dir)).toBe('refs/heads/main')
        expect(branchBase(repo.dir)).toBe(second)
    })

    it('finds nothing when there is no main at all', () => {
        repo.git(['update-ref', '-d', 'refs/heads/main'])
        expect(defaultBranchRef(repo.dir)).toBeUndefined()
        expect(branchBase(repo.dir)).toBeUndefined()
    })
})
