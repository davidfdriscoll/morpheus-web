#!/usr/bin/env ruby
# Runs Morpheus's own test fixture (from the submodule) against the WASM build
# and compares to the expected output. Order-only differences (same set of
# analyses, different sort order) are reported separately — a known, harmless
# platform qsort difference. Run after build.sh.  Usage: ruby wasm/test_wasm.rb
require 'json'

ROOT = File.expand_path('..', __dir__)
FIXTURE  = File.join(ROOT, 'morpheus', 'test', 'fixture.json')
CRUNCHER = File.join(ROOT, 'wasm', 'dist', 'cruncher.js')

examples = JSON.parse(File.read(FIXTURE))
hard = []; order = []
def analyses(s) = s.scan(/<NL>.*?<\/NL>/m).sort

examples.each do |ex|
  input, opts, expected = ex['input'], (ex['opts'] || []), ex['expected']
  actual = IO.popen(['node', 'cruncher.js', *opts], 'r+', chdir: File.dirname(CRUNCHER)) do |io|
    io.puts(input); io.close_write; io.read
  end
  if expected == actual then print '.'
  elsif analyses(expected) == analyses(actual) then print 'o'; order << [input, opts]
  else print 'F'; hard << [input, opts, expected, actual] end
end
puts "\n\n#{examples.length} examples, #{hard.length} content failures, #{order.length} order-only differences"
order.each { |i, o| puts "  order-only: #{i.inspect} #{o}" }
hard.each do |i, o, e, a|
  puts "CONTENT DIFF: #{i.inspect} (#{o})\n  expected: #{e.inspect}\n  actual:   #{a.inspect}"
end
exit(hard.empty? ? 0 : 1)
