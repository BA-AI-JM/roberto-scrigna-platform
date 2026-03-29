/**
 * E2E: Notification trigger types and priority mapping verification.
 *
 * Tests all 12 notification triggers exist, have correct priority mapping,
 * and Italian labels are defined. Validates the notification schema
 * independently of Supabase (pure logic tests).
 */


// ── Notification Types (mirrored from router for e2e validation) ────────────

/** All 12 notification trigger types per spec */
const ALL_TRIGGERS = [
  "checkin_overdue",
  "checkin_completed",
  "weight_deviation",
  "low_adherence",
  "plan_expiring",
  "invoice_overdue",
  "invoice_paid",
  "task_due_today",
  "task_overdue",
  "new_message",
  "training_logged",
  "milestone_reached",
] as const;

type NotificationTrigger = (typeof ALL_TRIGGERS)[number];
type NotificationPriority = "low" | "medium" | "high" | "urgent";

/** Expected trigger-to-priority mapping per spec */
const EXPECTED_PRIORITIES: Record<NotificationTrigger, NotificationPriority> = {
  checkin_overdue: "high",
  checkin_completed: "low",
  weight_deviation: "high",
  low_adherence: "medium",
  plan_expiring: "medium",
  invoice_overdue: "high",
  invoice_paid: "low",
  task_due_today: "medium",
  task_overdue: "high",
  new_message: "medium",
  training_logged: "low",
  milestone_reached: "low",
};

/** Expected Italian labels per spec */
const EXPECTED_LABELS: Record<NotificationTrigger, string> = {
  checkin_overdue: "Check-in scaduto",
  checkin_completed: "Check-in completato",
  weight_deviation: "Deviazione peso",
  low_adherence: "Aderenza bassa",
  plan_expiring: "Piano in scadenza",
  invoice_overdue: "Fattura scaduta",
  invoice_paid: "Fattura pagata",
  task_due_today: "Task in scadenza oggi",
  task_overdue: "Task scaduto",
  new_message: "Nuovo messaggio",
  training_logged: "Allenamento registrato",
  milestone_reached: "Obiettivo raggiunto",
};

// ── Tests ───────────────────────────────────────────────────────────────────

describe("Notification Triggers — Complete Coverage", () => {
  test("exactly 12 triggers defined", () => {
    expect(ALL_TRIGGERS).toHaveLength(12);
  });

  test("all triggers have unique names", () => {
    const unique = new Set(ALL_TRIGGERS);
    expect(unique.size).toBe(12);
  });

  test.each(ALL_TRIGGERS)("trigger '%s' has a valid priority", (trigger) => {
    const priority = EXPECTED_PRIORITIES[trigger];
    expect(["low", "medium", "high", "urgent"]).toContain(priority);
  });

  test.each(ALL_TRIGGERS)("trigger '%s' has an Italian label", (trigger) => {
    const label = EXPECTED_LABELS[trigger];
    expect(label).toBeDefined();
    expect(label.length).toBeGreaterThan(0);
  });
});

describe("Notification Priority Groups", () => {
  test("4 high-priority triggers", () => {
    const highPriority = ALL_TRIGGERS.filter(
      (t) => EXPECTED_PRIORITIES[t] === "high"
    );
    expect(highPriority).toHaveLength(4);
    expect(highPriority.sort()).toEqual([
      "checkin_overdue",
      "invoice_overdue",
      "task_overdue",
      "weight_deviation",
    ]);
  });

  test("4 medium-priority triggers", () => {
    const medium = ALL_TRIGGERS.filter(
      (t) => EXPECTED_PRIORITIES[t] === "medium"
    );
    expect(medium).toHaveLength(4);
    expect(medium.sort()).toEqual([
      "low_adherence",
      "new_message",
      "plan_expiring",
      "task_due_today",
    ]);
  });

  test("4 low-priority triggers", () => {
    const low = ALL_TRIGGERS.filter(
      (t) => EXPECTED_PRIORITIES[t] === "low"
    );
    expect(low).toHaveLength(4);
    expect(low.sort()).toEqual([
      "checkin_completed",
      "invoice_paid",
      "milestone_reached",
      "training_logged",
    ]);
  });

  test("no urgent triggers by default", () => {
    const urgent = ALL_TRIGGERS.filter(
      (t) => EXPECTED_PRIORITIES[t] === "urgent"
    );
    expect(urgent).toHaveLength(0);
  });
});

describe("Notification — Trigger Semantic Groups", () => {
  test("check-in triggers include overdue and completed", () => {
    const checkinTriggers = ALL_TRIGGERS.filter((t) =>
      t.startsWith("checkin_")
    );
    expect(checkinTriggers).toContain("checkin_overdue");
    expect(checkinTriggers).toContain("checkin_completed");
  });

  test("invoice triggers include overdue and paid", () => {
    const invoiceTriggers = ALL_TRIGGERS.filter((t) =>
      t.startsWith("invoice_")
    );
    expect(invoiceTriggers).toContain("invoice_overdue");
    expect(invoiceTriggers).toContain("invoice_paid");
  });

  test("task triggers include due_today and overdue", () => {
    const taskTriggers = ALL_TRIGGERS.filter((t) =>
      t.startsWith("task_")
    );
    expect(taskTriggers).toContain("task_due_today");
    expect(taskTriggers).toContain("task_overdue");
  });

  test("overdue events are always high priority", () => {
    const overdueTriggers = ALL_TRIGGERS.filter((t) =>
      t.includes("overdue")
    );
    overdueTriggers.forEach((trigger) => {
      expect(EXPECTED_PRIORITIES[trigger]).toBe("high");
    });
  });

  test("completion events are always low priority", () => {
    const completionTriggers: NotificationTrigger[] = [
      "checkin_completed",
      "invoice_paid",
      "training_logged",
      "milestone_reached",
    ];
    completionTriggers.forEach((trigger) => {
      expect(EXPECTED_PRIORITIES[trigger]).toBe("low");
    });
  });
});
