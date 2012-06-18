#!/bin/sh

phpextensions=$(git config hooks.php-file-extension)

git st --porcelain | grep -E '^(A|M)' | cut -d" " -f3 | grep -E "\\.($phpextensions)\$" | xargs -n1 php -l
