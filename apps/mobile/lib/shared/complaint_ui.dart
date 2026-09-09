import 'dart:io';

import 'package:flutter/material.dart';

import '../api/models.dart';
import '../core/theme.dart';

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String complaintTypeIconName(String type) {
  switch (type) {
    case 'electric':
    case 'plumbing':
    case 'housekeeping':
    case 'security':
    case 'lift':
    case 'other':
      return type;
    default:
      return 'other';
  }
}

IconData complaintTypeIconData(String type) {
  switch (complaintTypeIconName(type)) {
    case 'plumbing':
      return Icons.water_drop_outlined;
    case 'lift':
      return Icons.elevator_outlined;
    case 'electric':
      return Icons.lightbulb_outline;
    case 'security':
      return Icons.shield_outlined;
    case 'housekeeping':
      return Icons.cleaning_services_outlined;
    default:
      return Icons.assignment_outlined;
  }
}

String complaintFlatLabel(String? flatNumber) {
  final number = flatNumber?.trim() ?? '';
  return number.isEmpty ? '' : 'Flat $number';
}

String formatComplaintWhen(String iso) {
  final date = DateTime.tryParse(iso);
  if (date == null) return '';
  final local = date.toLocal();
  final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
  final ampm = local.hour >= 12 ? 'PM' : 'AM';
  final minute = local.minute.toString().padLeft(2, '0');
  return '${local.day} ${_months[local.month - 1]} ${local.year}, $hour:$minute $ampm';
}

String formatComplaintRaised(String iso) {
  final date = DateTime.tryParse(iso);
  if (date == null) return '';
  final local = date.toLocal();
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(local.year, local.month, local.day);
  if (day == today) return 'today';
  if (day == today.subtract(const Duration(days: 1))) return 'yesterday';
  return '${local.day} ${_months[local.month - 1]} ${local.year}';
}

String formatComplaintTimelineWhen(String iso) {
  final date = DateTime.tryParse(iso);
  if (date == null) return '';
  final local = date.toLocal();
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final day = DateTime(local.year, local.month, local.day);
  final hour = local.hour % 12 == 0 ? 12 : local.hour % 12;
  final ampm = local.hour >= 12 ? 'PM' : 'AM';
  final minute = local.minute.toString().padLeft(2, '0');
  final time = '$hour:$minute $ampm';
  if (day == today) return 'Today, $time';
  if (day == today.subtract(const Duration(days: 1))) return 'Yesterday, $time';
  return '${local.day} ${_months[local.month - 1]} ${local.year}, $time';
}

InputDecoration underlineFieldDecoration(String label, {String? hint}) {
  const border = UnderlineInputBorder(
    borderSide: BorderSide(color: AppColors.sand),
  );
  return InputDecoration(
    labelText: label,
    hintText: hint,
    filled: false,
    border: border,
    enabledBorder: border,
    focusedBorder: const UnderlineInputBorder(
      borderSide: BorderSide(color: AppColors.leaf, width: 1.5),
    ),
    contentPadding: const EdgeInsets.symmetric(vertical: 12),
  );
}

class ComplaintTypeIcon extends StatelessWidget {
  const ComplaintTypeIcon({super.key, required this.type, this.size = 22});

  final String type;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 48,
      height: 48,
      decoration: const BoxDecoration(
        color: AppColors.mist,
        shape: BoxShape.circle,
      ),
      alignment: Alignment.center,
      child: Icon(
        complaintTypeIconData(type),
        size: size,
        color: AppColors.leafDark,
      ),
    );
  }
}

enum StatusBadgeVariant { filled, outlined }

class StatusBadge extends StatelessWidget {
  const StatusBadge({
    super.key,
    required this.status,
    this.variant = StatusBadgeVariant.filled,
  });

  final String status;
  final StatusBadgeVariant variant;

  @override
  Widget build(BuildContext context) {
    final label = complaintStatusLabel(status);
    if (variant == StatusBadgeVariant.outlined) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: AppColors.saffron),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.circle_outlined, size: 12, color: AppColors.saffron),
            const SizedBox(width: 6),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppColors.saffron,
              ),
            ),
          ],
        ),
      );
    }

    late final Color bg;
    if (status == 'open') {
      bg = AppColors.leafDark;
    } else if (status == 'in_progress') {
      bg = AppColors.saffron;
    } else if (status == 'resolved' || status == 'closed') {
      bg = AppColors.gold;
    } else {
      bg = AppColors.alert;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: Colors.white,
        ),
      ),
    );
  }
}

class ComplaintListTile extends StatelessWidget {
  const ComplaintListTile({
    super.key,
    required this.complaint,
    required this.onTap,
  });

  final ComplaintDto complaint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final location = complaintFlatLabel(complaint.flatNumber);
    final when = formatComplaintWhen(complaint.createdAt);

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          children: [
            ComplaintTypeIcon(type: complaint.type),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    complaint.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontSize: 15,
                    ),
                  ),
                  if (location.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      location,
                      style: const TextStyle(fontSize: 13, color: Colors.black54),
                    ),
                  ],
                  if (when.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        const Icon(
                          Icons.calendar_today_outlined,
                          size: 12,
                          color: AppColors.leafDark,
                        ),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            when,
                            style: const TextStyle(
                              fontSize: 12,
                              color: AppColors.leafDark,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                StatusBadge(status: complaint.status),
                const SizedBox(height: 6),
                const Text(
                  'Ticket ID',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                    color: Colors.black45,
                  ),
                ),
                Text(
                  complaint.ticketNumber,
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 4),
            const Icon(Icons.chevron_right, color: AppColors.leafDark),
          ],
        ),
      ),
    );
  }
}

class PhotoDropzone extends StatelessWidget {
  const PhotoDropzone({
    super.key,
    required this.onTap,
    this.count = 0,
  });

  final VoidCallback onTap;
  final int count;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: CustomPaint(
        painter: _DashedRRectPainter(color: AppColors.sand),
        child: Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 28),
          child: Column(
            children: [
              const Icon(Icons.image_outlined, color: AppColors.saffron, size: 32),
              const SizedBox(height: 8),
              Text(
                count == 0 ? 'Add photos' : '$count photo(s) selected',
                style: const TextStyle(
                  color: AppColors.saffron,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'JPG, PNG up to 5MB',
                style: TextStyle(fontSize: 12, color: Colors.black45),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _DashedRRectPainter extends CustomPainter {
  _DashedRRectPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.4;
    const radius = Radius.circular(12);
    final path = Path()
      ..addRRect(RRect.fromRectAndRadius(Offset.zero & size, radius));
    const dash = 6.0;
    const gap = 4.0;
    for (final metric in path.computeMetrics()) {
      var distance = 0.0;
      while (distance < metric.length) {
        final next = (distance + dash).clamp(0, metric.length).toDouble();
        canvas.drawPath(metric.extractPath(distance, next), paint);
        distance += dash + gap;
      }
    }
  }

  @override
  bool shouldRepaint(covariant _DashedRRectPainter oldDelegate) =>
      oldDelegate.color != color;
}

class ComplaintTimeline extends StatelessWidget {
  const ComplaintTimeline({super.key, required this.events});

  final List<ComplaintStatusEventDto> events;

  IconData _iconFor(String status) {
    switch (status) {
      case 'assigned':
        return Icons.check;
      case 'in_progress':
        return Icons.build_outlined;
      case 'resolved':
      case 'closed':
        return Icons.check_circle_outline;
      default:
        return Icons.send_outlined;
    }
  }

  String _titleFor(ComplaintStatusEventDto ev) {
    if (ev.fromStatus == null) return 'Submitted';
    return complaintStatusLabel(ev.toStatus);
  }

  @override
  Widget build(BuildContext context) {
    if (events.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Timeline', style: displayStyle(size: 20)),
        const SizedBox(height: 12),
        for (var i = 0; i < events.length; i++)
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                SizedBox(
                  width: 28,
                  child: Column(
                    children: [
                      Container(
                        width: 28,
                        height: 28,
                        decoration: const BoxDecoration(
                          color: AppColors.saffron,
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          _iconFor(events[i].toStatus),
                          size: 14,
                          color: Colors.white,
                        ),
                      ),
                      if (i != events.length - 1)
                        const Expanded(
                          child: VerticalDivider(
                            color: AppColors.saffron,
                            thickness: 2,
                            width: 2,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(bottom: i == events.length - 1 ? 0 : 16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _titleFor(events[i]),
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        if (events[i].createdAt.isNotEmpty)
                          Text(
                            formatComplaintTimelineWhen(events[i].createdAt),
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.black54,
                            ),
                          ),
                        if (events[i].actorName != null &&
                            events[i].actorName!.isNotEmpty)
                          Text(
                            'by ${events[i].actorName}',
                            style: const TextStyle(
                              fontSize: 12,
                              color: Colors.black54,
                            ),
                          ),
                        if (events[i].note != null && events[i].note!.isNotEmpty)
                          Text(
                            events[i].note!,
                            style: const TextStyle(color: Colors.black54),
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class CommitteeNoteCard extends StatelessWidget {
  const CommitteeNoteCard({
    super.key,
    required this.note,
    this.attribution = 'Maintenance Committee',
  });

  final String note;
  final String attribution;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.mist.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.groups_outlined, color: AppColors.leafDark),
          const SizedBox(height: 8),
          Text('Note from Committee', style: displayStyle(size: 18)),
          const SizedBox(height: 6),
          Text(note, style: const TextStyle(height: 1.4)),
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              '— $attribution',
              style: const TextStyle(fontSize: 12, color: Colors.black45),
            ),
          ),
        ],
      ),
    );
  }
}

class ComplaintPhotoStrip extends StatelessWidget {
  const ComplaintPhotoStrip({super.key, required this.attachments});

  final List<ComplaintAttachmentDto> attachments;

  @override
  Widget build(BuildContext context) {
    if (attachments.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          attachments.length == 1 ? 'Photo (1)' : 'Photos (${attachments.length})',
          style: displayStyle(size: 20),
        ),
        const SizedBox(height: 10),
        SizedBox(
          height: 140,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            itemCount: attachments.length,
            separatorBuilder: (_, _) => const SizedBox(width: 10),
            itemBuilder: (_, i) {
              final a = attachments[i];
              return ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Stack(
                  children: [
                    SizedBox(
                      width: 180,
                      height: 140,
                      child: a.url.startsWith('http')
                          ? Image.network(
                              a.url,
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => _photoFallback(a),
                            )
                          : a.url.startsWith('/')
                              ? Image.file(
                                  File(a.url),
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, _, _) => _photoFallback(a),
                                )
                              : _photoFallback(a),
                    ),
                    Positioned(
                      right: 8,
                      bottom: 8,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '${i + 1}/${attachments.length}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _photoFallback(ComplaintAttachmentDto a) {
    return Container(
      color: AppColors.mist,
      alignment: Alignment.center,
      child: Text(
        a.contentKind == 'image' ? 'Image' : 'Video',
        style: const TextStyle(fontSize: 12, color: Colors.black54),
      ),
    );
  }
}
