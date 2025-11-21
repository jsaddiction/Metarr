import { main } from './test-omdb-reliability.js';
import fs from 'fs';

(async () => {
  try {
    const { stats, results, output } = await main();

    // Save detailed results to JSON file
    fs.writeFileSync(
      'omdb-test-results.json',
      JSON.stringify(output, null, 2)
    );

    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
})();
