import readline from "readline";
import chalk from "chalk";

/**
 * Prompts the user for a single line of input.
 * Shows a default value in parentheses; pressing Enter accepts it.
 */
export function prompt(question: string, defaultValue = ""): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const hint = defaultValue ? chalk.gray(` (${defaultValue})`) : "";

  return new Promise((resolve) => {
    rl.question(`${question}${hint}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Prompts for a yes/no answer. Returns true for yes.
 */
export async function confirm(
  question: string,
  defaultYes = true,
): Promise<boolean> {
  const hint = defaultYes ? "Y/n" : "y/N";
  const answer = await prompt(`${question} ${chalk.gray(`[${hint}]`)}`);
  if (!answer) return defaultYes;
  return answer.toLowerCase().startsWith("y");
}

/**
 * Prompts the user to pick from a numbered list.
 * Returns the chosen item.
 */
export async function choose<T extends string>(
  question: string,
  choices: T[],
  defaultIdx = 0,
): Promise<T> {
  console.log(question);
  choices.forEach((c, i) => {
    const marker = i === defaultIdx ? chalk.cyan("›") : " ";
    console.log(`  ${marker} ${chalk.bold(i + 1)}. ${c}`);
  });

  const answer = await prompt(
    chalk.gray(`Enter number`),
    String(defaultIdx + 1),
  );

  const idx = parseInt(answer, 10) - 1;
  if (isNaN(idx) || idx < 0 || idx >= choices.length) {
    return choices[defaultIdx];
  }
  return choices[idx];
}
