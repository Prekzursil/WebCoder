import pathlib

p = pathlib.Path('src/services/ApiService.ts')
s = p.read_text(encoding='utf-8')

anchor = "  getWaHelpQueue: () =>"
if anchor not in s:
    # PR5 worktree predates PR4 — anchor on the weekly board instead
    anchor = "  getWeeklyBoard: () =>"
idx = s.index(anchor)
end = s.index('\n  },', idx)
addition = '''
  // ---- Wave F items 66-69: reputation, awards, AMAs, requests ----
  getMyReputation: () =>
    apiFetch<ReputationProfile>('/community/reputation/me/'),
  getReputationTiers: () =>
    apiFetch<{ tiers: { name: string; min_honor: number }[] }>(
      '/community/reputation/tiers/',
    ),
  getAwards: (username?: string) => {
    const qs = username ? `?username=${encodeURIComponent(username)}` : '';
    return apiFetch<PaginatedResponse<AwardRow>>(`/community/awards/${qs}`);
  },
  grantAward: (data: { username: string; kind: string; reason?: string }) =>
    apiFetch<AwardRow>('/community/awards/grant/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getAmas: () => apiFetch<{ count: number; results: AmaListRow[] }>('/community/amas/'),
  getAma: (id: number) => apiFetch<AmaDetailRow>(`/community/amas/${id}/`),
  createAma: (data: { title: string; description: string; starts_at: string; ends_at: string }) =>
    apiFetch<AmaDetailRow>('/community/amas/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  askAmaQuestion: (sessionId: number, question: string) =>
    apiFetch<{ id: number }>(`/community/amas/${sessionId}/questions/`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
  answerAmaQuestion: (questionId: number, answer: string) =>
    apiFetch<{ id: number; answer: string }>(
      `/community/amas/questions/${questionId}/answer/`,
      { method: 'POST', body: JSON.stringify({ answer }) },
    ),
  upvoteAmaQuestion: (questionId: number) =>
    apiFetch<{ upvotes: number; voted: boolean }>(
      `/community/amas/questions/${questionId}/upvote/`,
      { method: 'POST' },
    ),
  getProblemRequests: () =>
    apiFetch<PaginatedResponse<ProblemRequestRow>>('/community/problem-requests/'),
  createProblemRequest: (data: { title: string; description: string }) =>
    apiFetch<ProblemRequestRow>('/community/problem-requests/', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  voteProblemRequest: (requestId: number) =>
    apiFetch<{ votes: number; voted: boolean }>(
      `/community/problem-requests/${requestId}/vote/`,
      { method: 'POST' },
    ),'''
s = s[:end] + addition + s[end:]

# imports
old = "  WaHelpRow,\n  WikiListRow,"
if old in s:
    new = "  AmaDetailRow,\n  AmaListRow,\n  AwardRow,\n  ProblemRequestRow,\n  ReputationProfile,\n  WaHelpRow,\n  WikiListRow,"
  # placeholder — replaced below
else:
    new = None

# The PR5 tree lacks the publishing imports; anchor on CalibrationProfile.
if new is None:
    old = "  CalibrationProfile,\n  TeamStandingsResponse,"
    new = "  AmaDetailRow,\n  AmaListRow,\n  AwardRow,\n  CalibrationProfile,\n  ProblemRequestRow,\n  ReputationProfile,\n  TeamStandingsResponse,"
assert old in s, f"import anchor missing: {old!r}"
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8', newline='\n')
print('api ok')
