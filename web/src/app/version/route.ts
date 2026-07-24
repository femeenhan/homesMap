export const dynamic = 'force-static'

export function GET() {
  return Response.json({ build: process.env.VERCEL_GIT_COMMIT_SHA ?? 'dev' })
}
