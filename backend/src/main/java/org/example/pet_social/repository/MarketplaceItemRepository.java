package org.example.pet_social.repository;

import org.example.pet_social.entity.MarketplaceItem;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface MarketplaceItemRepository extends JpaRepository<MarketplaceItem, Long> {

    // seller is fetched eagerly here because the response DTO includes sellerName
    @EntityGraph(attributePaths = "seller")
    List<MarketplaceItem> findByStatusOrderByCreatedAtDesc(String status);

    @EntityGraph(attributePaths = "seller")
    List<MarketplaceItem> findByStatusAndCategoryOrderByCreatedAtDesc(String status, String category);

    @EntityGraph(attributePaths = "seller")
    List<MarketplaceItem> findBySeller_IdOrderByCreatedAtDesc(Long sellerId);

    // "Listings" stat on the Me tab: everything except withdrawn (active + sold still count)
    long countBySeller_IdAndStatusNot(Long sellerId, String status);
}
