#!/bin/bash

# Check if the script is run as root
if [[ $EUID -ne 0 ]]; then
   echo "This script must be run as root" 1>&2
   exit 1
fi

# Check if required commands are available
if ! command -v lsblk &>/dev/null || ! command -v blkid &>/dev/null; then
    echo "The required commands 'lsblk' and 'blkid' are not available. Please install them and try again."
    exit 1
fi

# Find the empty disk
empty_disk=$(lsblk -dpnlo NAME,SIZE,TYPE,MOUNTPOINT | grep -w "disk" | awk 'NF==3 {print $1}' | head -n 1)

if [[ -z $empty_disk ]]; then
    echo "No empty disk found. Exiting."
    exit 1
fi

echo "Found empty disk: $empty_disk"

# Check if the disk is mounted or has partitions
mounted=$(grep -c "${empty_disk}" /proc/mounts)
partitions=$(lsblk -dpnlo NAME,TYPE | grep -w "^${empty_disk}" | grep -c "part")

if [[ $mounted -ne 0 ]] || [[ $partitions -ne 0 ]]; then
    echo "The disk is either mounted or has partitions. Exiting."
    exit 1
fi

# Create a new partition on the empty disk
echo "Creating a new partition on $empty_disk"
echo -e "n\np\n1\n\n\nw" | fdisk "$empty_disk"

# Format the new partition as ext4
partition="${empty_disk}1"
echo "Formatting the new partition $partition as ext4"
mkfs.ext4 "$partition"

# Mount the new partition to /mnt
echo "Mounting $partition to /mnt"
mount "$partition" /mnt

# Check if the mount was successful
if ! grep -qs "${partition}" /proc/mounts; then
    echo "Failed to mount ${partition} to /mnt. Exiting."
    exit 1
fi

# Check if a home directory exists before copying its content
if [[ -d /home ]]; then
    echo "Copying /home to /mnt"
    cp -a /home/* /mnt/
else
    echo "/home directory not found. Creating an empty directory at /mnt/home"
    mkdir -p /mnt/home
fi

# Move the old home directory to home.orig and create a new home directory
echo "Moving /home to /home.orig"
mv /home /home.orig
mkdir /home

# Unmount /mnt
echo "Unmounting /mnt"
umount /mnt

# Mount the new partition to /home
echo "Mounting $partition to /home"
mount "$partition" /home

# Check if the mount was successful
if ! grep -qs "${partition}" /proc/mounts; then
    echo "Failed to mount ${partition} to /home. Restoring the original /home directory."
    rm -rf /home
    mv /home.orig /home
    exit 1
fi

# Update /etc/fstab with the new mount point
echo "Updating /etc/fstab with the new mount point"
uuid=$(blkid -s UUID -o value "$partition")
cp /etc/fstab /etc/fstab.orig
echo "UUID=$uuid /home ext4 defaults 0 2" >> /etc/fstab

# Verify the new setup
echo "Verifying the new setup"
mount -a
df -h /home
echo "Script completed successfully"

echo "Reboot the VM to verify the mount points are correct"
echo "Run 'sudo nano /etc/fstab' to correct the mounts"
