#!/bin/sh

git st --porcelain | grep -E '^(A|M)' | cut -d" " -f3 | grep -E '\.(inc|psp)$' | xargs -n1 php -l
