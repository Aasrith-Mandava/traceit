// The accounts the e2e suite signs in as (e2e/auth.setup.ts creates them; playwright.config.ts
// gives each project its storage state). Not a spec: shared by the config, the setup and specs.

export const E2E_BASE = "http://localhost:3100";
export const DEMO_BASE = "http://127.0.0.1:3101";

/** Signed-in browser states (cookies), written by e2e/auth.setup.ts. Gitignored. */
export const STATE = {
  /** The e2e server's main student: every chromium / ai spec runs as them. */
  student: "e2e/.auth/student.json",
  /** A second student (scoping: someone else's data is 404). */
  studentB: "e2e/.auth/student-b.json",
  teacher: "e2e/.auth/teacher.json",
  /** The demo server's shared guests ("Try the demo" / "Try the teacher view"). */
  demoStudent: "e2e/.auth/demo-student.json",
  demoTeacher: "e2e/.auth/demo-teacher.json",
} as const;

/** No cookies: a signed-out visitor. */
export const SIGNED_OUT = { cookies: [], origins: [] };

export const PASSWORD = "e2e-password-1234";

export interface E2eAccount {
  name: string;
  email: string;
  role: "student" | "teacher";
  state: string;
}

export const ACCOUNTS = {
  student: { name: "Ada Student", email: "ada.student@e2e.test", role: "student", state: STATE.student },
  studentB: { name: "Ben Student", email: "ben.student@e2e.test", role: "student", state: STATE.studentB },
  teacher: { name: "Tess Teacher", email: "tess.teacher@e2e.test", role: "teacher", state: STATE.teacher },
} as const satisfies Record<string, E2eAccount>;
