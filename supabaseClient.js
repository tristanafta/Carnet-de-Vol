import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://uxetefavaavjbimdielv.supabase.co";
const supabaseKey = "sb_publishable_xK0ex3TSoG4lTYRlF8sttw_P7GJSlnN";

export const supabase = createClient(supabaseUrl, supabaseKey);
