exports.presentSession = s => !s ? s : ({ ...s,
 rounds: (s.rounds || []).map(r => ({...r, assessments: r.assessments?.map(a=>({...a,roleId:a.roleId||a.agent,roleTitle:a.roleTitle||a.title,score:a.score??a.confidenceScore}))})),
 crossExaminations: (s.crossExaminations || []).map(c=>({...c,criticName:c.criticName||c.title,rebuttal:c.rebuttal||(c.coreChallenges||[]).join('\n'),vulnerabilitiesIdentified:c.coreChallenges})),
 finalVerdict: s.finalVerdict ? {...s.finalVerdict,judgeName:s.finalVerdict.judgeName||s.finalVerdict.judge,decision:s.finalVerdict.decision||s.finalVerdict.verdict,consensusScore:s.finalVerdict.consensusScore??s.finalVerdict.overallScore,summary:s.finalVerdict.summary||s.finalVerdict.recommendation,actionItems:s.finalVerdict.actionItems||s.finalVerdict.conditions} : null
});
