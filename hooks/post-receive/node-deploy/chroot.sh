#!/bin/bash
#
# credits : http://root-lab.fr/2012/01/25/creer-chroot-ssh-limite-simplement/

mkdir -p {bin,dev,lib,lib64,repo}
mknod dev/null c 1 3
mknod dev/zero c 1 5
chmod 0666 dev/{null,zero}

TMPFILE1=./temp1
TMPFILE2=./temp2

APPS="/bin/sh /bin/bash /bin/cp /bin/ls /bin/mkdir /bin/mv /bin/rm /bin/rmdir /bin/cat /bin/less /usr/bin/tail /usr/local/bin/node"

for app in $APPS;  do
    if [ -x $app ]; then
        app_path=`dirname $app`
        if ! [ -d .$app_path ]; then
            mkdir -p .$app_path
        fi
        cp -p $app .$app
        ldd $app >> ${TMPFILE1}
    fi
done

for libs in `cat ${TMPFILE1}`; do
    frst_char="`echo $libs | cut -c1`"
    if [ "$frst_char" = "/" ]; then
        echo "$libs" >> ${TMPFILE2}
    fi
done

for lib in `cat ${TMPFILE2}`; do
        mkdir -p .`dirname $lib` > /dev/null 2>&1
        cp $lib .$lib
done

cp -r /lib/terminfo ./lib/
if ! [ -d "./usr/local/lib/node_modules" ]
then
    mkdir -p ./usr/local/lib/node_modules
fi
cp -pR /usr/local/lib/node_modules ./usr/local/lib/
ln -s ../lib/node_modules/npm/bin/npm-cli.js ./usr/local/bin/npm

rm -f $TMPFILE1
rm -f $TMPFILE2