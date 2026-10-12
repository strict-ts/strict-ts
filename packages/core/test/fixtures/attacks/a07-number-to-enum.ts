// Any number is taken for a member of a numeric enum.
enum Level { Low, High }
const measured: number = 7;
const level: Level = measured;
const label = (of: Level): string => {
  switch (of) {
    case Level.Low:
      return 'low';
    case Level.High:
      return 'high';
  }
};
if (typeof label(level) !== 'string') console.log('BROKEN a07: label is typed string and is', typeof label(level));
export {};
