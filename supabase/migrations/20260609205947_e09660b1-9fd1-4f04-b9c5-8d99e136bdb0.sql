
CREATE TABLE public.users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO anon, authenticated;
GRANT ALL ON public.users TO service_role;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open users read" ON public.users FOR SELECT USING (true);
CREATE POLICY "open users insert" ON public.users FOR INSERT WITH CHECK (true);
CREATE POLICY "open users update" ON public.users FOR UPDATE USING (true) WITH CHECK (true);

CREATE TABLE public.matchdays (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matchdays TO anon, authenticated;
GRANT ALL ON public.matchdays TO service_role;
ALTER TABLE public.matchdays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open matchdays all" ON public.matchdays FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.matches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  matchday_id UUID NOT NULL REFERENCES public.matchdays(id) ON DELETE CASCADE,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_at TIMESTAMPTZ NOT NULL,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_matches_matchday ON public.matches(matchday_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open matches all" ON public.matches FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  matchday_id UUID NOT NULL REFERENCES public.matchdays(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, matchday_id)
);
CREATE INDEX idx_submissions_matchday ON public.submissions(matchday_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.submissions TO anon, authenticated;
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open submissions all" ON public.submissions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL CHECK (outcome IN ('1','X','2')),
  home_score INT NOT NULL,
  away_score INT NOT NULL,
  UNIQUE(submission_id, match_id)
);
CREATE INDEX idx_predictions_submission ON public.predictions(submission_id);
CREATE INDEX idx_predictions_match ON public.predictions(match_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.predictions TO anon, authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "open predictions all" ON public.predictions FOR ALL USING (true) WITH CHECK (true);
