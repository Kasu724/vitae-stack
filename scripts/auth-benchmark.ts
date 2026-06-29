import { hashPassword } from "better-auth/crypto";

const samples: number[] = [];
for (let index = 0; index < 5; index += 1) {
  const startedAt = performance.now();
  await hashPassword("synthetic-password-benchmark-input");
  samples.push(Math.round(performance.now() - startedAt));
}

const sorted = [...samples].sort((left, right) => left - right);
console.log(
  JSON.stringify({
    samplesMs: samples,
    medianMs: sorted[Math.floor(sorted.length / 2)],
  }),
);
