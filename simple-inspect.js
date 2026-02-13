window.inspectSimple = function inspectSimple() {
  for (var k in header_record) {
    messages.value += '(internal ' + k + ': ' + header_record[k] + ')\n';
  }
  messages.value += 'Recording time: '
    + (header_record['endtime'] - header_record['starttime']) / 1000 + '\n';

  makeLINfile();

  //makeRevisionTable();

  processGraphFormat();
  messages.value += ''
    + 'Process: ' + processlength + '\n'       // from processGF
    + 'Product: ' + current_text.length + '\n' // from processGF
    + 'Keystrokes: ' + nKeydowns + '\n'
    + 'Pauses: ' + numberOfPauses + '\n'
    + 'Pausetime : ' + totalPauseTime + '\n'
    + 'Insertions: ' + insertions + '\n'
    + 'Deletions: ' + deletions + '\n'
    + 'Replacements: ' + replacements + '\n';
  messages.scrollTop = messages.scrollHeight;
};
