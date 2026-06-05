/**
 * Cost report aggregation — pure queries over generation_log.
 * Reference: docs/plan.md "Phase 5 — Execution & Indexing" cost-report spec.
 *
 * Reports:
 *   - Cost-per-article (clean: only successful attempt costs / successful articles)
 *   - Cost-per-article fully-loaded (all attempts including failures / successful articles)
 *   - Model split (% calls and % spend per model)
 *   - Totals
 *   - V2 projection (cost × fixtures × article types × passes)
 */

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ totalFixtures?: number, articleTypesCount?: number, passesPerArticle?: number }} [projectionParams]
 * @returns {object} Cost report
 */
export function generateCostReport(db, projectionParams = {}) {
  const { totalFixtures = 104, articleTypesCount = 4, passesPerArticle = 3 } = projectionParams;

  // Total spend (all attempts)
  const totalRow = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) as total_spend,
           COUNT(*) as total_calls
    FROM generation_log
  `).get();

  // Successful spend only
  const successRow = db.prepare(`
    SELECT COALESCE(SUM(cost_usd), 0) as success_spend
    FROM generation_log
    WHERE status = 'success'
  `).get();

  // Count distinct successful articles
  const articlesRow = db.prepare(`
    SELECT COUNT(DISTINCT fixture_id || '|' || article_type) as count
    FROM generation_log
    WHERE status = 'success'
  `).get();

  const articlesGenerated = articlesRow.count;
  const totalSpend = totalRow.total_spend;
  const successSpend = successRow.success_spend;

  const costPerArticle = articlesGenerated > 0 ? successSpend / articlesGenerated : 0;
  const costPerArticleFullyLoaded = articlesGenerated > 0 ? totalSpend / articlesGenerated : 0;

  // Model split
  const modelRows = db.prepare(`
    SELECT model_used,
           COUNT(*) as calls,
           COALESCE(SUM(cost_usd), 0) as spend
    FROM generation_log
    GROUP BY model_used
  `).all();

  const totalCalls = modelRows.reduce((sum, r) => sum + r.calls, 0);
  const totalModelSpend = modelRows.reduce((sum, r) => sum + r.spend, 0);

  const modelSplit = {};
  for (const row of modelRows) {
    modelSplit[row.model_used] = {
      calls: row.calls,
      callPercent: totalCalls > 0 ? (row.calls / totalCalls) * 100 : 0,
      spend: row.spend,
      spendPercent: totalModelSpend > 0 ? (row.spend / totalModelSpend) * 100 : 0,
    };
  }

  // Projection
  const projection = {
    totalFixtures,
    articleTypesCount,
    passesPerArticle,
    v2TotalEstimate: costPerArticleFullyLoaded * totalFixtures * articleTypesCount * passesPerArticle,
  };

  return {
    totalSpend,
    articlesGenerated,
    costPerArticle,
    costPerArticleFullyLoaded,
    modelSplit,
    projection,
  };
}
